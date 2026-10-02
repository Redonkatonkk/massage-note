import { randomInt, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import type { User } from "@massage-note/database";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IdempotencyService } from "../src/common/idempotency.service.js";
import { PrismaService } from "../src/database/prisma.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";
import { WorkRecordsService } from "../src/work-records/work-records.service.js";
import { FinanceQueriesService } from "../src/finance/finance-queries.service.js";
import { EmployeeSettlementsService } from "../src/finance/employee-settlements.service.js";
import { EmployeeSettlementPaymentsService } from "../src/finance/employee-settlement-payments.service.js";
import { PayrollSettlementsService } from "../src/finance/payroll-settlements.service.js";
import { CashSettlementsService } from "../src/finance/cash-settlements.service.js";
import type { EmployeeSettlementPaymentScope } from "@massage-note/contracts";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService();
const access = new StoreAccessService(prisma);
const idempotency = new IdempotencyService(prisma);
const finance = new FinanceQueriesService(prisma, access);
const documents = new EmployeeSettlementsService(prisma, access, finance);
const payments = new EmployeeSettlementPaymentsService(prisma, access, idempotency, documents);
const payroll = new PayrollSettlementsService(prisma, access, idempotency);
const cash = new CashSettlementsService(prisma, access, idempotency);
const work = new WorkRecordsService(prisma, access, idempotency);
const storeId = randomUUID(), ownerId = randomUUID(), employeeId = randomUUID();
const ownerMembershipId = randomUUID(), membershipId = randomUUID(), otherMemberId = randomUUID(), serviceItemId = randomUUID();
const owner = { id: ownerId } as User;
const employee = { id: employeeId } as User;
const query = (from: string, to = from, paymentScope: EmployeeSettlementPaymentScope = "ALL") => ({ membershipId, dateFrom: from, dateTo: to, paymentScope });
const preview = (from: string, to = from, scope: EmployeeSettlementPaymentScope = "ALL") => payments.preview(owner, storeId, query(from, to, scope));
const calendar = () => payments.calendar(owner, storeId, { membershipId, month: "2026-09" });
const key = () => randomUUID();
async function confirm(from: string, to = from, scope: EmployeeSettlementPaymentScope = "ALL", deductionCents = 0) {
  const quoted = await preview(from, to, scope);
  return payments.confirm(owner, storeId, { ...query(from, to, scope), deductionCents, revision: quoted.payment.revision }, key(), key());
}

async function record(date: string, member = membershipId) {
  const created = await work.create(owner, storeId, { employeeMembershipId: member, startAt: `${date}T16:00:00Z`, serviceItemId }, key(), key());
  return work.confirmPayment(owner, storeId, created.id, { version: created.version, cashServiceCents: 4000, cardServiceCents: 6000, cashTipCents: 1000, cardTipCents: 2000, giftCardTipCents: 300, giftCardSerialNumber: "CALENDAR-TEST" }, key(), key());
}

describe.skipIf(!enabled).sequential("工资日历、抵扣与结清事务", () => {
  beforeAll(async () => {
    await prisma.user.createMany({ data: [ownerId, employeeId].map((id) => ({ id, firebaseUid: `calendar-${id}`, phoneE164: `+1770${randomInt(10000000, 99999999)}` })) });
    await prisma.store.create({ data: { id: storeId, storeCode: String(randomInt(0, 1000000)).padStart(6, "0"), name: "结算日历测试", timezone: "America/New_York", businessCutoffLocal: "22:00", globalCommissionBps: 6000, status: "ACTIVE" } });
    await prisma.storeMembership.createMany({ data: [
      { id: ownerMembershipId, storeId, userId: ownerId, role: "OWNER", displayName: "店主", displayNameNormalized: "店主" },
      { id: membershipId, storeId, userId: employeeId, role: "EMPLOYEE", displayName: "员工", displayNameNormalized: "员工", defaultCommissionBps: 6000 },
      { id: otherMemberId, storeId, role: "EMPLOYEE", displayName: "另一员工", displayNameNormalized: "另一员工", defaultCommissionBps: 6000 },
    ] });
    await prisma.store.update({ where: { id: storeId }, data: { ownerMembershipId } });
    await prisma.serviceItem.create({ data: { id: serviceItemId, storeId, fullName: "按摩", shortName: "按摩", durationMinutes: 60, priceCents: 10000n, position: 0, priceOptions: { create: { durationMinutes: 60, priceCents: 10000n, position: 0 } } } });
    for (const day of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) await record(`2026-09-${String(day).padStart(2, "0")}`);
    await record("2026-09-07", otherMemberId);
    await record("2026-09-11", ownerMembershipId);
  }, 30000);

  afterAll(async () => {
    if (enabled) {
      await prisma.payrollSettlement.deleteMany({ where: { storeId } });
      await prisma.dailyCashSettlement.deleteMany({ where: { storeId } });
      await prisma.paymentBreakdown.deleteMany({ where: { workRecord: { storeId } } });
      await prisma.workRecord.deleteMany({ where: { storeId } });
      await prisma.idempotencyRequest.deleteMany({ where: { storeId } });
      await prisma.auditLog.deleteMany({ where: { storeId } });
      await prisma.domainOutbox.deleteMany({ where: { storeId } });
      await prisma.dailyEmployeeRow.deleteMany({ where: { storeId } });
      await prisma.dailyBoard.deleteMany({ where: { storeId } });
      await prisma.serviceItem.deleteMany({ where: { storeId } });
      await prisma.store.updateMany({ where: { id: storeId }, data: { ownerMembershipId: null } });
      await prisma.storeMembership.deleteMany({ where: { storeId } });
      await prisma.store.deleteMany({ where: { id: storeId } });
      await prisma.user.deleteMany({ where: { id: { in: [ownerId, employeeId] } } });
    }
    await prisma.$disconnect();
  });

  it("手工预付不猜测状态，抵扣后只登记实付；完整单据和幂等重试保留", async () => {
    await payroll.create(owner, storeId, { membershipId, periodStart: "2026-09-01", periodEnd: "2026-09-01", totalPaidCents: 1000, paymentScope: "ALL" }, key(), key());
    expect((await calendar()).days.find((d) => d.businessDate === "2026-09-01")).toMatchObject({ cashSettled: false, nonCashSettled: false });
    const quoted = await preview("2026-09-01");
    expect(quoted.summary.totalIncomeCents).toBe(9300);
    const body = { ...query("2026-09-01"), deductionCents: 1000, revision: quoted.payment.revision };
    const requestKey = key();
    const paid = await payments.confirm(owner, storeId, body, requestKey, key());
    expect(paid).toMatchObject({ totalPaidCents: 8300n, confirmation: { deductionCents: 1000n, unsettledCents: 9300n } });
    expect((await payments.confirm(owner, storeId, body, requestKey, key())).id).toBe(paid.id);
    expect(await prisma.auditLog.count({ where: { entityId: paid.id, action: "payroll_settlement.confirmed" } })).toBe(1);
    const after = await preview("2026-09-01");
    expect(after.summary).toEqual(quoted.summary);
    expect(after.records).toEqual(quoted.records);
    expect(after.payment).toMatchObject({ unsettledCents: 0, fullyConfirmed: true });
    await expect(confirm("2026-09-01")).rejects.toBeInstanceOf(ConflictException);
  });

  it("每日现金已取得不再付款，非现金确认后显示两个对号，取消现金只回退黄色", async () => {
    await cash.settle(owner, storeId, "2026-09-02", membershipId, { version: 0 }, key(), key());
    const quoted = await preview("2026-09-02");
    expect(quoted.payment.unsettledCents).toBe(5900);
    expect(quoted.summary.totalIncomeCents).toBe(9300);
    const paid = await confirm("2026-09-02", "2026-09-02", "NON_CASH");
    expect(paid.totalPaidCents).toBe(5900n);
    expect((await calendar()).days.find((d) => d.businessDate === "2026-09-02")).toMatchObject({ cashSettled: true, nonCashSettled: true });
    await cash.reopen(owner, storeId, "2026-09-02", membershipId, { version: 1 }, key(), key());
    expect((await calendar()).days.find((d) => d.businessDate === "2026-09-02")).toMatchObject({ cashSettled: false, nonCashSettled: true });
    expect((await preview("2026-09-02")).payment.unsettledCents).toBe(3400);
  });

  it("部分重叠按日期和来源排除，另一有效确认仍贡献对号", async () => {
    const first = await confirm("2026-09-03", "2026-09-03", "NON_CASH");
    const quoted = await preview("2026-09-03", "2026-09-04");
    expect(quoted.summary.totalIncomeCents).toBe(18600);
    expect(quoted.payment.unsettledCents).toBe(12700);
    expect((await confirm("2026-09-03", "2026-09-04")).totalPaidCents).toBe(12700n);
    await payroll.remove(owner, storeId, first.id, { version: 1 }, key(), key());
    expect((await calendar()).days.find((d) => d.businessDate === "2026-09-03")).toMatchObject({ cashSettled: true, nonCashSettled: true });
  });

  it("抵扣不能超额，全部抵扣后零实付也确认结清", async () => {
    const quoted = await preview("2026-09-05");
    await expect(payments.confirm(owner, storeId, { ...query("2026-09-05"), deductionCents: 9301, revision: quoted.payment.revision }, key(), key())).rejects.toBeInstanceOf(BadRequestException);
    await payroll.create(owner, storeId, { membershipId, periodStart: "2026-09-05", periodEnd: "2026-09-05", totalPaidCents: 9300, paymentScope: "ALL" }, key(), key());
    expect((await confirm("2026-09-05", "2026-09-05", "ALL", 9300)).totalPaidCents).toBe(0n);
    expect((await preview("2026-09-05")).payment.fullyConfirmed).toBe(true);
  });

  it("修改账本同步来源、日期和员工；删除及恢复同步状态", async () => {
    const paid = await confirm("2026-09-06");
    const edited = await payroll.update(owner, storeId, paid.id, { version: 1, periodStart: "2026-09-07", periodEnd: "2026-09-07", paymentScope: "CASH" }, key(), key());
    const days = (await calendar()).days;
    expect(days.find((d) => d.businessDate === "2026-09-06")).toMatchObject({ cashSettled: false, nonCashSettled: false });
    expect(days.find((d) => d.businessDate === "2026-09-07")).toMatchObject({ cashSettled: true, nonCashSettled: false });
    const moved = await payroll.update(owner, storeId, paid.id, { version: edited.version, membershipId: otherMemberId }, key(), key());
    const otherCalendar = () => payments.calendar(owner, storeId, { membershipId: otherMemberId, month: "2026-09" });
    expect((await calendar()).days.find((d) => d.businessDate === "2026-09-07")?.cashSettled).toBe(false);
    expect((await otherCalendar()).days[0]?.cashSettled).toBe(true);
    const removed = await payroll.remove(owner, storeId, paid.id, { version: moved.version }, key(), key());
    expect((await otherCalendar()).days[0]?.cashSettled).toBe(false);
    await payroll.restore(owner, storeId, paid.id, { version: removed.version }, key(), key());
    expect((await otherCalendar()).days[0]?.cashSettled).toBe(true);
  });

  it("旧预览在现金或记工变化后拒绝登记并回滚", async () => {
    const quoted = await preview("2026-09-08");
    await cash.settle(owner, storeId, "2026-09-08", membershipId, { version: 0 }, key(), key());
    const before = await prisma.payrollSettlement.count({ where: { storeId } });
    await expect(payments.confirm(owner, storeId, { ...query("2026-09-08"), deductionCents: 0, revision: quoted.payment.revision }, key(), key())).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.payrollSettlement.count({ where: { storeId } })).toBe(before);
    const old = await preview("2026-09-09");
    const row = await prisma.workRecord.findFirstOrThrow({ where: { storeId, businessDate: new Date("2026-09-09T00:00:00Z") } });
    await work.update(owner, storeId, row.id, { version: row.version, isHighlighted: true }, key(), key());
    await expect(payments.confirm(owner, storeId, { ...query("2026-09-09"), deductionCents: 0, revision: old.payment.revision }, key(), key())).rejects.toBeInstanceOf(ConflictException);
  });

  it("两个不同请求同时确认仅成功一次，另一请求返回冲突", async () => {
    const quoted = await preview("2026-09-10");
    const body = { ...query("2026-09-10"), deductionCents: 0, revision: quoted.payment.revision };
    const results = await Promise.allSettled([payments.confirm(owner, storeId, body, key(), key()), payments.confirm(owner, storeId, body, key(), key())]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toBeInstanceOf(ConflictException);
    expect(await prisma.payrollSettlement.count({ where: { storeId, periodStart: new Date("2026-09-10T00:00:00Z") } })).toBe(1);
  });

  it("权限、跨店归属、空记工和店主仅预览边界", async () => {
    await expect(payments.calendar(employee, storeId, { membershipId, month: "2026-09" })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(payments.calendar(owner, storeId, { membershipId: randomUUID(), month: "2026-09" })).rejects.toBeInstanceOf(NotFoundException);
    await expect(confirm("2026-09-30")).rejects.toBeInstanceOf(BadRequestException);
    const q = { ...query("2026-09-11"), membershipId: ownerMembershipId };
    const own = await payments.preview(owner, storeId, q);
    expect(own.records).toHaveLength(1);
    await expect(payments.confirm(owner, storeId, { ...q, deductionCents: 0, revision: own.payment.revision }, key(), key())).rejects.toBeInstanceOf(ForbiddenException);
  });
});
