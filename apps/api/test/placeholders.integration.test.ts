import { randomInt, randomUUID } from "node:crypto";
import type { User, WorkRecordStatus } from "@massage-note/database";
import type { WorkBotParsedIntent } from "@massage-note/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readBusinessData } from "../src/ai/business-reader.js";
import { BoardsService } from "../src/boards/boards.service.js";
import { deviceTimeContext } from "../src/common/device-time.js";
import { IdempotencyService } from "../src/common/idempotency.service.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { CashSettlementsService } from "../src/finance/cash-settlements.service.js";
import { ClosingsService } from "../src/finance/closings.service.js";
import { FinanceAnalyticsService } from "../src/finance/finance-analytics.service.js";
import { FinanceQueriesService } from "../src/finance/finance-queries.service.js";
import { PayrollSettlementsService } from "../src/finance/payroll-settlements.service.js";
import { CommissionsService } from "../src/stores/commissions.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";
import { WorkBotService } from "../src/work-bot/work-bot.service.js";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService();
const access = new StoreAccessService(prisma);
const idempotency = new IdempotencyService(prisma);
const boards = new BoardsService(prisma, access, idempotency);
const finance = new FinanceQueriesService(prisma, access);
const cash = new CashSettlementsService(prisma, access, idempotency);
const closings = new ClosingsService(prisma, access, idempotency);
const analytics = new FinanceAnalyticsService(prisma, access);
const payroll = new PayrollSettlementsService(prisma, access, idempotency);
const commissions = new CommissionsService(prisma, access, idempotency);
const bot = new WorkBotService(prisma, access);
const storeId = randomUUID(), ownerId = randomUUID(), ownerMemberId = randomUUID();
const employeeMemberId = randomUUID(), placeholderMemberId = randomUUID();
const realId = randomUUID(), placeholderId = randomUUID(), onlyPlaceholderId = randomUUID();
const day = "2026-09-08", onlyDay = "2026-09-07";
const actor = { id: ownerId } as User;
const date = (value: string) => new Date(`${value}T00:00:00Z`);
const query = { dateFrom: onlyDay, dateTo: day, membershipIds: [], paymentMethod: "ALL", amountType: "ALL", highlightFilter: "ALL" } as const;
const botContext = { platform: "WECHATPAD" as const, botId: `placeholder-${storeId}`, groupId: "placeholder-consumers", senderId: "placeholder-owner" };
const token = `mnw_${"p".repeat(48)}`;
const previousToken = process.env.LANGBOT_WORK_TOKEN;

function record(id: string, membershipId: string, businessDate: string, status: WorkRecordStatus, hour: string) {
  const confirmed = status === "CONFIRMED";
  return {
    id, storeId, employeeMembershipId: membershipId, businessDate: date(businessDate),
    startAt: new Date(`${businessDate}T${hour}:00:00Z`), status,
    storeTimezoneSnapshot: "America/New_York", businessCutoffSnapshot: "00:00",
    mainServiceAmountCents: confirmed ? 10000n : 0n, grossFeeBaseCents: confirmed ? 10000n : 0n,
    discountedFeePerformanceCents: confirmed ? 10000n : 0n,
    mainServiceWageCents: confirmed ? 5000n : 0n, totalLargeFeeWageCents: confirmed ? 5000n : 0n,
    ...(confirmed ? {
      cashServiceCents: 10000n, cardServiceCents: 0n, giftCardServiceCents: 0n,
      cashTipCents: 0n, cardTipCents: 0n, giftCardTipCents: 0n, totalTipCents: 0n,
      actualServiceCollectedCents: 10000n, customerTotalPaidCents: 10000n, paymentDifferenceCents: 0n,
      employeeTotalIncomeCents: 5000n, cashAllocatedServiceWageCents: 5000n,
      cashAcquiredServiceWageCents: 5000n, cashWageShortfallCents: 0n,
    } : {}),
    createdBy: ownerId, updatedBy: ownerId,
    // Real service predates payroll; placeholders are deliberately newer.
    ...(confirmed ? { updatedAt: new Date("2026-09-08T18:00:00Z") } : {}),
  };
}

async function botEvent(messageId: string, rawText: string, parsedIntent: WorkBotParsedIntent) {
  return bot.handleEvent(`Bearer ${token}`, `wechatpad:${botContext.botId}:${messageId}`, {
    ...botContext, messageId, rawText, parsedIntent, occurredAt: new Date().toISOString(),
  }, messageId);
}

describe.skipIf(!enabled).sequential("占位卡的数据消费隔离", () => {
  beforeAll(async () => {
    process.env.LANGBOT_WORK_TOKEN = token;
    await prisma.user.create({ data: { id: ownerId, firebaseUid: `placeholder-consumers-${ownerId}`, phoneE164: `+1646${randomInt(10000000, 99000000)}` } });
    await prisma.store.create({ data: { id: storeId, storeCode: randomInt(0, 1000000).toString().padStart(6, "0"), name: "占位隔离测试", status: "ACTIVE", timezone: "America/New_York", businessCutoffLocal: "00:00", globalCommissionBps: 5000, automaticDispatchEnabled: true } });
    await prisma.storeMembership.createMany({ data: [
      { id: ownerMemberId, storeId, userId: ownerId, role: "OWNER", displayName: "老板", displayNameNormalized: "老板" },
      { id: employeeMemberId, storeId, role: "EMPLOYEE", displayName: "服务员工", displayNameNormalized: "服务员工", defaultCommissionBps: 5000 },
      { id: placeholderMemberId, storeId, role: "EMPLOYEE", displayName: "占位员工", displayNameNormalized: "占位员工", defaultCommissionBps: 5000 },
    ] });
    await prisma.store.update({ where: { id: storeId }, data: { ownerMembershipId: ownerMemberId } });
    for (const businessDate of [onlyDay, day]) {
      await prisma.dailyBoard.create({ data: { storeId, businessDate: date(businessDate), rows: { create: [
        { storeId, membershipId: employeeMemberId, position: 1, addedBy: ownerId },
        { storeId, membershipId: placeholderMemberId, position: 2, addedBy: ownerId },
      ] } } });
    }
    await prisma.workRecord.createMany({ data: [
      record(realId, employeeMemberId, day, "CONFIRMED", "16"),
      record(placeholderId, employeeMemberId, day, "PLACEHOLDER", "15"),
      record(onlyPlaceholderId, placeholderMemberId, onlyDay, "PLACEHOLDER", "15"),
      record(randomUUID(), placeholderMemberId, "2026-09-01", "PLACEHOLDER", "15"),
    ] });
    await prisma.workBotGroupBinding.create({ data: { platform: botContext.platform, botId: botContext.botId, groupId: botContext.groupId, storeId, memberBindings: { create: { senderId: botContext.senderId, membershipId: ownerMemberId, verifiedAt: new Date() } } } });
  });

  afterAll(async () => {
    if (previousToken === undefined) delete process.env.LANGBOT_WORK_TOKEN;
    else process.env.LANGBOT_WORK_TOKEN = previousToken;
    if (enabled) {
      await prisma.workBotOperation.deleteMany({ where: { storeId } });
      await prisma.workBotGroupBinding.deleteMany({ where: { storeId } });
      await prisma.payrollSettlement.deleteMany({ where: { storeId } });
      await prisma.employeeDefaultCommission.deleteMany({ where: { storeId } });
      await prisma.employeeClosingDelivery.deleteMany({ where: { storeId } });
      await prisma.businessDayClosing.deleteMany({ where: { storeId } });
      await prisma.dailyCashSettlement.deleteMany({ where: { storeId } });
      await prisma.workRecord.deleteMany({ where: { storeId } });
      await prisma.auditLog.deleteMany({ where: { storeId } });
      await prisma.domainOutbox.deleteMany({ where: { storeId } });
      await prisma.idempotencyRequest.deleteMany({ where: { storeId } });
      await prisma.dailyEmployeeRow.deleteMany({ where: { storeId } });
      await prisma.dailyBoard.deleteMany({ where: { storeId } });
      await prisma.store.update({ where: { id: storeId }, data: { ownerMembershipId: null } });
      await prisma.storeMembership.deleteMany({ where: { storeId } });
      await prisma.store.delete({ where: { id: storeId } });
      await prisma.user.delete({ where: { id: ownerId } });
    }
    await prisma.$disconnect();
  });

  it("看板保留按时间混排的占位，但行统计和财务日期不计占位", async () => {
    const board = await boards.getBoard(actor, storeId, day);
    const row = board.rows.find(item => item.membershipId === employeeMemberId)!;
    expect(row.workRecords.map(item => item.id)).toEqual([placeholderId, realId]);
    expect(row.statistics).toMatchObject({ recordCount: 1, grossFeeBaseCents: 10000n, totalLargeFeeWageCents: 5000n });
    expect(board.statistics).toMatchObject({ recordCount: 1, totalIncomeCents: 5000n });
    const only = await boards.getBoard(actor, storeId, onlyDay);
    const placeholderRow = only.rows.find(item => item.membershipId === placeholderMemberId)!;
    expect(placeholderRow.workRecords.map(item => item.id)).toEqual([onlyPlaceholderId]);
    expect(placeholderRow.statistics.recordCount).toBe(0);
    expect(await boards.openWorkDates(actor, storeId, { dateFrom: "2026-09-01", dateTo: day })).toEqual({ dates: [day], closedDates: [] });
    await expect(boards.removeRow(actor, storeId, onlyDay, placeholderRow.id, { version: placeholderRow.version }, randomUUID(), "placeholder-protect-row")).rejects.toMatchObject({ response: { code: "BOARD_ROW_HAS_ACTIVITY" } });
    await boards.updateRow(actor, storeId, onlyDay, placeholderRow.id, { version: placeholderRow.version, isHidden: true }, randomUUID(), "placeholder-hide-row");
    const hidden = (await boards.getBoard(actor, storeId, onlyDay)).rows.find(item => item.membershipId === placeholderMemberId)!;
    expect(hidden.isHidden).toBe(true);
    expect(hidden.workRecords.map(item => item.id)).toEqual([onlyPlaceholderId]);
    expect(hidden.statistics.recordCount).toBe(0);
  });

  it("汇总、明细、CSV、现金与日结小结排除占位，不制造待付款警告", async () => {
    const aiRecords = await readBusinessData(prisma, storeId, { id: ownerMemberId, role: "OWNER" }, { table: "WorkRecord", includeDeleted: true });
    expect(aiRecords.rows.map(item => (item as { id: string }).id)).toEqual([realId]);
    expect((await readBusinessData(prisma, storeId, { id: ownerMemberId, role: "OWNER" }, { table: "WorkRecord", id: placeholderId, includeDeleted: true })).rows).toEqual([]);
    const summary = await finance.summary(actor, storeId, { ...query, membershipIds: [] });
    expect(summary.totals).toMatchObject({ recordCount: 1, incompleteRecordCount: 0, grossFeeBaseCents: 10000n });
    expect((await finance.details(actor, storeId, { ...query, membershipIds: [] })).records.map(item => item.id)).toEqual([realId]);
    expect((await finance.exportCsv(actor, storeId, { ...query, membershipIds: [] })).trim().split("\n")).toHaveLength(2);
    const cashRows = (await cash.list(actor, storeId, day)).rows;
    expect(cashRows).toHaveLength(1);
    expect(cashRows[0]).toMatchObject({ membershipId: employeeMemberId, incompleteRecordCount: 0, cashReceivedCents: 10000n });
    expect((await cash.list(actor, storeId, onlyDay)).rows).toEqual([]);
    expect((await closings.preview(actor, storeId, onlyDay)).storeTotals.recordCount).toBe(0);
    const closing = await closings.previewMember(actor, storeId, day, employeeMemberId);
    expect(closing.employee).toMatchObject({ recordCount: 1, incompleteRecordCount: 0 });
    expect(closing.records.map(item => item.id)).toEqual([realId]);
    const placeholderClosing = await closings.previewMember(actor, storeId, onlyDay, placeholderMemberId);
    expect(placeholderClosing.records).toEqual([]);
    expect(placeholderClosing.employee.recordCount).toBe(0);
    expect(placeholderClosing.hasWarnings).toBe(false);
  });

  it("经营分析起始日期、客户数和小时计数忽略占位，普通服务仍计数", async () => {
    const result = await analytics.analytics(actor, storeId, {});
    expect(result.dateFrom).toBe(day);
    expect(result.hours.reduce((sum, item) => sum + item.count, 0)).toBe(1);
    expect((await analytics.analytics(actor, storeId, { dateFrom: onlyDay, dateTo: onlyDay })).hasData).toBe(false);
  });

  it("提成调整不会重算占位，工资历史提示只跟随实际服务修改", async () => {
    const refreshed = await deviceTimeContext.run({ timezone: "America/New_York", now: new Date(`${onlyDay}T20:00:00Z`) }, () => commissions.setDefault(actor, storeId, placeholderMemberId, { version: 1, commissionBps: 6000 }, randomUUID(), "placeholder-commission"));
    expect(refreshed.refreshedCurrentDayRecordCount).toBe(0);
    expect(await prisma.workRecord.findUniqueOrThrow({ where: { id: onlyPlaceholderId } })).toMatchObject({ version: 1, status: "PLACEHOLDER", totalLargeFeeWageCents: 0n, cashServiceCents: null });
    await prisma.payrollSettlement.create({ data: { storeId, membershipId: employeeMemberId, periodStart: date(onlyDay), periodEnd: date(day), settlementDate: date("2026-09-09"), serviceWageCents: 5000n, cashTipCents: 0n, cardTipCents: 0n, adjustmentCents: 0n, totalPaidCents: 5000n, paymentMethod: "CASH", createdBy: ownerId, updatedBy: ownerId, updatedAt: new Date("2026-09-09T18:00:00Z") } });
    expect((await payroll.list(actor, storeId, { includeDeleted: false }))[0]!.historyChangedAfterSettlement).toBe(false);
    await prisma.workRecord.update({ where: { id: realId }, data: { note: "实际服务变化" } });
    expect((await payroll.list(actor, storeId, { includeDeleted: false }))[0]!.historyChangedAfterSettlement).toBe(true);
  });

  it("机器人ALL/DELETED查账排除占位，按编号修改和付款被拒绝", async () => {
    const queryResult = await botEvent("placeholder-query-all", "查全部记录", { kind: "QUERY", dateFrom: onlyDay, dateTo: day, status: "ALL" });
    expect(queryResult.reply).toContain("共 1 笔");
    expect(queryResult.reply).toContain(realId);
    expect(queryResult.reply).not.toContain(placeholderId);
    expect(queryResult.reply).not.toContain(onlyPlaceholderId);
    await expect(botEvent("placeholder-manage-update", `修改 ${placeholderId} 高亮`, { kind: "MANAGE", operation: "UPDATE", recordId: placeholderId, evidence: `修改 ${placeholderId} 高亮`, details: { isHighlighted: true } })).rejects.toMatchObject({ response: { code: "PLACEHOLDER_READ_ONLY" } });
    await expect(botEvent("placeholder-manage-payment", `支付 ${placeholderId} 100 0现金`, { kind: "MANAGE", operation: "PAYMENT", recordId: placeholderId, evidence: `支付 ${placeholderId} 100 0现金`, payment: { cashServiceCents: 10000, cardServiceCents: 0, cashTipCents: 0, cardTipCents: 0 } })).rejects.toMatchObject({ response: { code: "PLACEHOLDER_READ_ONLY" } });
    await expect(botEvent("placeholder-adjust", `${placeholderId} 高亮`, { kind: "ADJUST", recordId: placeholderId, isHighlighted: true, highlightMention: "高亮" })).resolves.toMatchObject({ outcome: "NO_ACTIVE_WORK" });
    await prisma.workRecord.update({ where: { id: placeholderId }, data: { deletedAt: new Date(), deletedBy: ownerId, deleteReason: "占位已跳过" } });
    const deleted = await botEvent("placeholder-query-deleted", "查已删除记录", { kind: "QUERY", dateFrom: onlyDay, dateTo: day, status: "DELETED" });
    expect(deleted.reply).toContain("共 0 笔");
  });
});
