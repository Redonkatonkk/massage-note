import { randomInt, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { User } from "@massage-note/database";
import type { CreateExpenseInput, ExpenseItemResponse } from "@massage-note/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IdempotencyService } from "../src/common/idempotency.service.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";
import { ExpensesService } from "../src/finance/expenses.service.js";
const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService(), access = new StoreAccessService(prisma);
const service = new ExpensesService(prisma, access, new IdempotencyService(prisma));
const storeId = randomUUID(), otherStore = randomUUID(), owner = randomUUID(), manager = randomUUID(), employee = randomUUID(), outsider = randomUUID();
const actors = [owner, manager, employee, outsider];
const actor = (id = owner) => ({ id }) as User;
const key = () => randomUUID();
const rule = { startDate: "2026-01-01", unit: "MONTH" as const, interval: 3, amountMode: "FIXED" as const, amountCents: 90000 };
const create = (input: CreateExpenseInput = { kind: "RECURRING", name: "房租", note: "", rule }, user = owner, requestKey = key()) => service.create(actor(user), storeId, input, requestKey, key());
const lines = async (item: ExpenseItemResponse, month: string) => (await service.month(actor(), storeId, month)).lines.filter(l => l.itemId === item.id);

describe.skipIf(!enabled).sequential("支出持久化、权限与事务", () => {
  beforeAll(async () => {
    await prisma.user.createMany({ data: actors.map(id => ({ id, firebaseUid: `expense-${id}`, phoneE164: `+1646${randomInt(1000000, 9999999)}` })) });
    for (const id of [storeId, otherStore]) await prisma.store.create({ data: { id, storeCode: randomInt(0, 1000000).toString().padStart(6, "0"), name: "支出测试", timezone: "America/New_York", businessCutoffLocal: "00:00", globalCommissionBps: 5000, status: "ACTIVE" } });
    await prisma.storeMembership.createMany({ data: [
      ...(["OWNER", "MANAGER", "EMPLOYEE"] as const).map((role, i) => ({ storeId, userId: actors[i]!, role, displayName: role, displayNameNormalized: role.toLowerCase() })),
      { storeId: otherStore, userId: owner, role: "OWNER", displayName: "owner", displayNameNormalized: "owner" },
    ] });
  });
  afterAll(async () => {
    if (enabled) {
      await prisma.expensePeriodOverride.deleteMany({ where: { rule: { item: { storeId } } } });
      await prisma.expenseRuleRevision.deleteMany({ where: { item: { storeId } } });
      await prisma.expenseItem.deleteMany({ where: { storeId } });
      for (const id of [storeId, otherStore]) {
        await prisma.businessDayClosing.deleteMany({ where: { storeId: id } });
        await prisma.idempotencyRequest.deleteMany({ where: { storeId: id } });
        await prisma.auditLog.deleteMany({ where: { storeId: id } });
        await prisma.domainOutbox.deleteMany({ where: { storeId: id } });
        await prisma.storeMembership.deleteMany({ where: { storeId: id } });
        await prisma.store.delete({ where: { id } });
      }
      await prisma.user.deleteMany({ where: { id: { in: actors } } });
    }
    await prisma.$disconnect();
  });
  it("数据库禁止一次性金额缺失及负数，不留下半笔数据", async () => {
    for (const amountCents of [null, -1n]) {
      await expect(prisma.expenseItem.create({ data: { storeId, name: "无效费用", kind: "ONCE", occurredOn: new Date("2026-01-01T00:00:00Z"), amountCents, createdBy: owner, updatedBy: owner } })).rejects.toThrow();
    }
    expect(await prisma.expenseItem.count({ where: { storeId, name: "无效费用" } })).toBe(0);
  });
  it("店主、经理可读写；员工与店外用户禁止读取和写入", async () => {
    const item = await create(undefined, manager);
    expect((await service.month(actor(manager), storeId, "2026-01")).items.some(i => i.id === item.id)).toBe(true);
    for (const id of [employee, outsider]) {
      await expect(service.month(actor(id), storeId, "2026-01")).rejects.toBeInstanceOf(ForbiddenException);
      await expect(create(undefined, id)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.update(actor(id), storeId, item.id, { version: item.version, name: "bad" }, key(), key())).rejects.toBeInstanceOf(ForbiddenException);
    }
    await expect(service.remove(actor(), otherStore, item.id, { version: item.version }, key(), key())).rejects.toBeInstanceOf(NotFoundException);
    expect((await service.month(actor(), otherStore, "2026-01")).items).toEqual([]);
  });
  it("创建幂等，不重复费用、审计和 outbox；不同载荷拒绝复用", async () => {
    const requestKey = key(), payload: CreateExpenseInput = { kind: "ONCE", name: "维修", note: "", occurredOn: "2026-02-10", amountCents: 10001 };
    const first = await create(payload, owner, requestKey), replay = await create(payload, owner, requestKey);
    expect(replay.id).toBe(first.id);
    expect(await prisma.auditLog.count({ where: { entityId: first.id } })).toBe(1);
    expect(await prisma.domainOutbox.count({ where: { aggregateId: first.id } })).toBe(1);
    await expect(create({ ...payload, amountCents: 10002 }, owner, requestKey)).rejects.toBeInstanceOf(ConflictException);
  });
  it("单期实际账单包括零，撤销恢复预算，关联不能跨项目", async () => {
    const item = await create({ kind: "RECURRING", name: "电费", note: "", rule: { ...rule, interval: 1, amountMode: "BUDGET", amountCents: 10000 } });
    const period = { version: item.version, ruleId: item.rules[0]!.id, periodStart: "2026-01-01", amountCents: 0 };
    const saved = await service.period(actor(manager), storeId, item.id, period, key(), key());
    expect((await lines(saved, "2026-01"))[0]).toMatchObject({ allocatedCents: "0", source: "ACTUAL", hasOverride: true });
    expect((await lines(saved, "2026-02"))[0]).toMatchObject({ allocatedCents: "10000", source: "BUDGET" });
    const other = await create();
    await expect(service.period(actor(), storeId, other.id, { ...period, version: other.version }, key(), key())).rejects.toBeInstanceOf(BadRequestException);
    const cleared = await service.period(actor(), storeId, item.id, { version: saved.version, ruleId: period.ruleId, periodStart: period.periodStart }, key(), key());
    expect((await lines(cleared, "2026-01"))[0]).toMatchObject({ allocatedCents: "10000", source: "BUDGET", hasOverride: false });
  });
  it("规则变更保留历史，错误边界回滚，停止保留覆盖期，可重新开始", async () => {
    let item = await create();
    await expect(service.revise(actor(), storeId, item.id, { version: item.version, rule: { ...rule, startDate: "2026-02-01" } }, key(), key())).rejects.toBeInstanceOf(BadRequestException);
    expect((await prisma.expenseItem.findUniqueOrThrow({ where: { id: item.id } })).version).toBe(item.version);
    item = await service.revise(actor(), storeId, item.id, { version: item.version, rule: { ...rule, startDate: "2026-04-01", amountCents: 120000 } }, key(), key());
    expect((await lines(item, "2026-03"))[0]?.allocatedCents).toBe("30000");
    expect((await lines(item, "2026-04"))[0]?.allocatedCents).toBe("40000");
    item = await service.stop(actor(), storeId, item.id, { version: item.version, effectiveFrom: "2026-07-01" }, key(), key());
    expect((await lines(item, "2026-06"))[0]?.allocatedCents).toBe("40000"); expect(await lines(item, "2026-07")).toEqual([]);
    item = await service.revise(actor(), storeId, item.id, { version: item.version, rule: { ...rule, startDate: "2026-10-01" } }, key(), key());
    expect(await lines(item, "2026-09")).toEqual([]); expect((await lines(item, "2026-10"))[0]?.allocatedCents).toBe("30000");
  });
  it("已有未来账单不会被规则变更或停止悄悄丢弃", async () => {
    let item = await create();
    item = await service.period(actor(), storeId, item.id, { version: item.version, ruleId: item.rules[0]!.id, periodStart: "2026-04-01", amountCents: 91000 }, key(), key());
    await expect(service.stop(actor(), storeId, item.id, { version: item.version, effectiveFrom: "2026-04-01" }, key(), key())).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.revise(actor(), storeId, item.id, { version: item.version, rule: { ...rule, startDate: "2026-04-01" } }, key(), key())).rejects.toBeInstanceOf(BadRequestException);
    expect((await lines(item, "2026-04"))[0]?.periodAmountCents).toBe("91000");
  });
  it("并发同版本仅成功一次，失败操作无额外审计，旧版本返回409", async () => {
    const item = await create(), before = await prisma.auditLog.count({ where: { entityId: item.id } });
    const results = await Promise.allSettled(["A", "B"].map(name => service.update(actor(), storeId, item.id, { version: item.version, name }, key(), key())));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect((results.find(r => r.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(ConflictException);
    expect(await prisma.auditLog.count({ where: { entityId: item.id } })).toBe(before + 1);
    await expect(service.update(actor(), storeId, item.id, { version: item.version, name: "C" }, key(), key())).rejects.toBeInstanceOf(ConflictException);
  });
  it("已日结月份可补录、修改、删除恢复，不改变日结快照", async () => {
    const closing = await prisma.businessDayClosing.create({ data: { storeId, businessDate: new Date("2026-02-10T00:00:00Z"), status: "CLOSED", closedBy: owner, cycleNo: 1, totalsSnapshotJson: { revenue: 12345 }, warningSnapshotJson: [] } });
    let item = await create({ kind: "ONCE", name: "修理", note: "原备注", occurredOn: "2026-02-10", amountCents: 20000 });
    item = await service.update(actor(), storeId, item.id, { version: item.version, amountCents: 22000, note: "更正" }, key(), key());
    expect((await lines(item, "2026-02"))[0]?.allocatedCents).toBe("22000");
    item = await service.remove(actor(), storeId, item.id, { version: item.version }, key(), key());
    expect(await lines(item, "2026-02")).toEqual([]);
    item = await service.restore(actor(), storeId, item.id, { version: item.version }, key(), key());
    expect((await lines(item, "2026-02"))[0]?.allocatedCents).toBe("22000");
    expect(await prisma.businessDayClosing.findUniqueOrThrow({ where: { id: closing.id } })).toEqual(closing);
    const logs = await prisma.auditLog.findMany({ where: { entityId: item.id } });
    expect(logs).toHaveLength(4); expect(logs.every(l => l.beforeJson || l.action === "expense.created")).toBe(true);
    expect(await prisma.domainOutbox.count({ where: { aggregateId: item.id, aggregateType: "expense_item" } })).toBe(logs.length);
  });
});
