import { randomInt, randomUUID } from "node:crypto";
import { ConflictException } from "@nestjs/common";
import type { User } from "@massage-note/database";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { AiService } from "../src/ai/ai.service.js";
import { MiniMaxLanguageModelProvider } from "../src/ai/language-model.provider.js";
import { GoogleSpeechToTextProvider } from "../src/ai/speech-to-text.provider.js";
import { IdempotencyService } from "../src/common/idempotency.service.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { CashSettlementsService } from "../src/finance/cash-settlements.service.js";
import { FinanceQueriesService } from "../src/finance/finance-queries.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";
import { WorkRecordsService } from "../src/work-records/work-records.service.js";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService();
const access = new StoreAccessService(prisma);
const idempotency = new IdempotencyService(prisma);
const workRecords = new WorkRecordsService(prisma, access, idempotency);
const finance = new FinanceQueriesService(prisma, access);
const cash = new CashSettlementsService(prisma, access, idempotency);
const provider = new MiniMaxLanguageModelProvider();
const speech = new GoogleSpeechToTextProvider();
const ai = new AiService(prisma, access, finance, cash, workRecords, provider, speech);
const storeId = randomUUID();
const userId = randomUUID();
const membershipId = randomUUID();
const serviceItemId = randomUUID();
const addonItemId = randomUUID();
const discountItemId = randomUUID();
const actor = { id: userId } as User;
const originalKey = process.env.MINIMAX_API_KEY;

describe.skipIf(!enabled).sequential("AI 预览、确认和确定性财务工具", () => {
  beforeAll(async () => {
    process.env.MINIMAX_API_KEY = "";
    await prisma.user.create({ data: { id: userId, firebaseUid: `ai-test-${userId}`, phoneE164: `+1212${randomInt(10_000_000, 99_000_000)}` } });
    await prisma.store.create({ data: { id: storeId, storeCode: randomInt(0, 1_000_000).toString().padStart(6, "0"), name: "AI 测试店", timezone: "America/New_York", businessCutoffLocal: "22:00", globalCommissionBps: 5_000, status: "ACTIVE" } });
    await prisma.storeMembership.create({ data: { id: membershipId, storeId, userId, role: "OWNER", displayName: "AI店主", displayNameNormalized: "ai店主", isServiceProvider: true } });
    await prisma.store.update({ where: { id: storeId }, data: { ownerMembershipId: membershipId } });
    await prisma.serviceItem.create({ data: { id: serviceItemId, storeId, fullName: "按摩", shortName: "按摩", durationMinutes: 60, priceCents: 10_000n, defaultCommissionBps: 6_000, position: 0, priceOptions: { create: [{ durationMinutes: 30, priceCents: 6_000n, position: 0 }, { durationMinutes: 60, priceCents: 10_000n, position: 1 }] } } });
    await prisma.addonItem.create({ data: { id: addonItemId, storeId, name: "热石加项", shortName: "热石", amountCents: 2_000n, durationMinutes: 15, defaultCommissionBps: 5_000, position: 0 } });
    await prisma.discountItem.create({ data: { id: discountItemId, storeId, name: "会员优惠", shortName: "会员减", amountCents: 1_000n, position: 0 } });
  });

  afterAll(async () => {
    if (originalKey === undefined) delete process.env.MINIMAX_API_KEY; else process.env.MINIMAX_API_KEY = originalKey;
    if (enabled) {
      await prisma.aiQueryLog.deleteMany({ where: { storeId } });
      await prisma.aiConversation.deleteMany({ where: { storeId } });
      await prisma.aiChangePreview.deleteMany({ where: { storeId } });
      await prisma.paymentBreakdown.deleteMany({ where: { workRecord: { storeId } } });
      await prisma.workRecord.deleteMany({ where: { storeId } });
      await prisma.idempotencyRequest.deleteMany({ where: { storeId } });
      await prisma.auditLog.deleteMany({ where: { storeId } });
      await prisma.domainOutbox.deleteMany({ where: { storeId } });
      await prisma.addonItem.deleteMany({ where: { storeId } });
      await prisma.discountItem.deleteMany({ where: { storeId } });
      await prisma.serviceItem.deleteMany({ where: { storeId } });
      await prisma.store.update({ where: { id: storeId }, data: { ownerMembershipId: null } });
      await prisma.storeMembership.deleteMany({ where: { storeId } });
      await prisma.store.delete({ where: { id: storeId } });
      await prisma.user.delete({ where: { id: userId } });
    }
    await prisma.$disconnect();
  });

  it("无模型密钥时仍可生成简单新增预览，且确认只能消费一次", async () => {
    const message = await ai.workMessage(actor, storeId, { text: "给AI店主记60分按摩，现金大费100，刷卡小费20" });
    expect(message.preview).toMatchObject({ operation: "CREATE_WORK_RECORD" });
    const previewId = message.preview!.previewId;
    const confirmed = await ai.confirmPreview(actor, storeId, previewId, "ai-confirm-test");
    expect(confirmed).toMatchObject({ status: "CONSUMED" });
    const records = await prisma.workRecord.findMany({ where: { storeId } });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ status: "CONFIRMED", cashServiceCents: 10_000n, cardTipCents: 2_000n });
    await expect(ai.confirmPreview(actor, storeId, previewId, "ai-confirm-repeat")).rejects.toBeInstanceOf(ConflictException);
  });

  it("并发确认同一预览时只有一个请求能进入执行流程", async () => {
    const message = await ai.workMessage(actor, storeId, { text: "给AI店主记60分按摩，现金大费80，现金小费10" });
    const previewId = message.preview!.previewId;
    const originalCreate = workRecords.create.bind(workRecords);
    let releaseExecution!: () => void;
    let markEntered!: () => void;
    const enteredExecution = new Promise<void>((resolve) => { markEntered = resolve; });
    const executionGate = new Promise<void>((resolve) => { releaseExecution = resolve; });
    const createSpy = vi.spyOn(workRecords, "create").mockImplementationOnce(async (...args) => {
      markEntered();
      await executionGate;
      return originalCreate(...args);
    });

    const first = ai.confirmPreview(actor, storeId, previewId, "ai-confirm-concurrent-1");
    await enteredExecution;
    await expect(ai.confirmPreview(actor, storeId, previewId, "ai-confirm-concurrent-2")).rejects.toMatchObject({
      response: { code: "AI_PREVIEW_EXECUTING" },
    });
    releaseExecution();
    await expect(first).resolves.toMatchObject({ status: "CONSUMED" });
    createSpy.mockRestore();

    expect(await prisma.auditLog.count({ where: { storeId, entityId: previewId, action: "ai.preview_consumed" } })).toBe(1);
  });

  it("模型工具参数不完整时返回中文追问，且包含 BigInt 的上下文可以安全序列化", async () => {
    const configuredSpy = vi.spyOn(provider, "isConfigured").mockReturnValue(true);
    const completeSpy = vi.spyOn(provider, "complete").mockResolvedValue({
      content: "",
      toolCall: { name: "prepare_work_change", arguments: { operation: "CREATE" } },
      provider: "test",
      model: "test",
    });
    const response = await ai.workMessage(actor, storeId, { text: "帮我记一单" });
    expect(response.preview).toBeNull();
    expect(response.answer).toContain("请补充员工显示名");
    expect(completeSpy.mock.calls[0]?.[0].user).toContain("10000");
    completeSpy.mockRestore();
    configuredSpy.mockRestore();
  });

  it("模型预览可新增额外项目、折扣、结束时间和备注，并在确认后完整写入", async () => {
    const startAt = new Date();
    const endAt = new Date(startAt.getTime() + 60 * 60_000);
    const configuredSpy = vi.spyOn(provider, "isConfigured").mockReturnValue(true);
    const completeSpy = vi.spyOn(provider, "complete").mockResolvedValue({
      content: "",
      toolCall: {
        name: "prepare_work_change",
        arguments: {
          operation: "CREATE",
          employeeName: "AI店主",
          serviceName: "按摩",
          serviceDurationMinutes: 60,
          startAt: startAt.toISOString(),
          endAt: endAt.toISOString(),
          addons: [{ name: "热石" }],
          discounts: [{ name: "会员优惠" }],
          cashServiceCents: 11_000,
          cashTipCents: 0,
          note: "AI 完整录入",
        },
      },
      provider: "test",
      model: "test",
    });
    const response = await ai.workMessage(actor, storeId, { text: "给我记一单60分按摩，加热石和会员优惠，现金大费110，没有小费" });
    expect(response.preview?.after).toMatchObject({ employee: "AI店主", service: "按摩", durationMinutes: 60, note: "AI 完整录入" });
    const confirmed = await ai.confirmPreview(actor, storeId, response.preview!.previewId, "ai-complete-create");
    expect(confirmed).toMatchObject({ status: "CONSUMED" });
    const saved = await prisma.workRecord.findFirstOrThrow({ where: { storeId, note: "AI 完整录入" }, include: { addonSnapshots: true, discountSnapshots: true } });
    expect(saved).toMatchObject({ status: "CONFIRMED", endAt, grossFeeBaseCents: 12_000n, discountedFeePerformanceCents: 11_000n, cashServiceCents: 11_000n, cashTipCents: 0n });
    expect(saved.addonSnapshots).toHaveLength(1);
    expect(saved.discountSnapshots).toHaveLength(1);
    completeSpy.mockRestore();
    configuredSpy.mockRestore();
  });

  it("模型预览可修改记录时间、项目金额、完整加项折扣列表和付款", async () => {
    const record = await prisma.workRecord.findFirstOrThrow({ where: { storeId, note: "AI 完整录入" } });
    const startAt = new Date(record.startAt.getTime() + 5 * 60_000);
    const configuredSpy = vi.spyOn(provider, "isConfigured").mockReturnValue(true);
    const completeSpy = vi.spyOn(provider, "complete").mockResolvedValue({
      content: "",
      toolCall: {
        name: "prepare_work_change",
        arguments: {
          operation: "UPDATE",
          recordId: record.id,
          startAt: startAt.toISOString(),
          mainServiceAmountCents: 9_000,
          addons: [],
          discounts: [],
          cardServiceCents: 9_000,
          cardTipCents: 500,
          note: "AI 已修改",
        },
      },
      provider: "test",
      model: "test",
    });
    const response = await ai.workMessage(actor, storeId, { text: "修改刚才那单" });
    expect(response.preview).toMatchObject({ operation: "UPDATE_WORK_RECORD", after: { startAt: startAt.toISOString(), amountCents: 9_000, addons: [], discounts: [], note: "AI 已修改" } });
    await expect(ai.confirmPreview(actor, storeId, response.preview!.previewId, "ai-complete-update")).resolves.toMatchObject({ status: "CONSUMED" });
    const saved = await prisma.workRecord.findUniqueOrThrow({ where: { id: record.id }, include: { addonSnapshots: true, discountSnapshots: true } });
    expect(saved).toMatchObject({ startAt, mainServiceAmountCents: 9_000n, grossFeeBaseCents: 9_000n, cardServiceCents: 9_000n, cardTipCents: 500n, note: "AI 已修改" });
    expect(saved.addonSnapshots).toHaveLength(0);
    expect(saved.discountSnapshots).toHaveLength(0);
    completeSpy.mockRestore();
    configuredSpy.mockRestore();
  });

  it("付款预览生成后记录若已变化，不会用新版本覆盖旧预览", async () => {
    const record = await prisma.workRecord.findFirstOrThrow({ where: { storeId }, orderBy: { createdAt: "asc" } });
    const preview = await prisma.aiChangePreview.create({
      data: {
        storeId,
        userId,
        operation: "UPDATE_WORK_RECORD",
        canonicalPayloadJson: { recordId: record.id, payment: { cashServiceCents: 9_000, cardServiceCents: 0, cashTipCents: 0, cardTipCents: 1_000 } },
        baseVersionsJson: { workRecord: record.version },
        warningsJson: [],
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    await prisma.workRecord.update({ where: { id: record.id }, data: { version: { increment: 1 }, note: "其他人刚刚修改" } });

    await expect(ai.confirmPreview(actor, storeId, preview.id, "ai-stale-payment")).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.aiChangePreview.findUniqueOrThrow({ where: { id: preview.id } })).toMatchObject({ status: "PENDING", consumedAt: null });
    expect(await prisma.workRecord.findUniqueOrThrow({ where: { id: record.id } })).toMatchObject({ cashServiceCents: 10_000n, cardTipCents: 2_000n });
  });

  it("财务助手始终使用后端统计结果并记录查询日志", async () => {
    const response = await ai.financeMessage(actor, storeId, { text: "查一下今天全部大费和小费" });
    expect(response.answer).toContain("实际收到大费 $270.00");
    expect(response.answer).toContain("小费 $35.00");
    expect(response.answer).toContain("确定性财务引擎");
    expect(await prisma.aiQueryLog.count({ where: { storeId } })).toBeGreaterThanOrEqual(2);
  });
});
