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
import { EmployeeSettlementSharesService } from "../src/finance/employee-settlement-shares.service.js";
import { createHash } from "node:crypto";
import { EmployeeSettlementPaymentsService } from "../src/finance/employee-settlement-payments.service.js";
import { PayrollSettlementsService } from "../src/finance/payroll-settlements.service.js";
import { ClosingsService } from "../src/finance/closings.service.js";
import { MembershipsService } from "../src/stores/memberships.service.js";
import { CashSettlementsService } from "../src/finance/cash-settlements.service.js";
import type { EmployeeSettlementPaymentScope } from "@massage-note/contracts";

const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService();
const access = new StoreAccessService(prisma);
const idempotency = new IdempotencyService(prisma);
const finance = new FinanceQueriesService(prisma, access);
const documents = new EmployeeSettlementsService(prisma, access, finance);
const shares = new EmployeeSettlementSharesService(prisma, access, idempotency, documents);
const payments = new EmployeeSettlementPaymentsService(prisma, access, idempotency, documents);
const payroll = new PayrollSettlementsService(prisma, access, idempotency);
const cash = new CashSettlementsService(prisma, access, idempotency);
const closings = new ClosingsService(prisma, access, idempotency);
const members = new MembershipsService(prisma, access);
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
      await prisma.businessDayClosing.deleteMany({ where: { storeId } });
      await prisma.store.deleteMany({ where: { id: storeId } });
      await prisma.user.deleteMany({ where: { id: { in: [ownerId, employeeId] } } });
    }
    await prisma.$disconnect();
  });

  it("分享保存准确快照和 14 天期限，幂等重放不延长有效期", async () => {
    const input = { ...query("2026-09-01"), amountType: "TIP" as const };
    const requestKey = key();
    const result = await shares.create(owner, storeId, input, requestKey, key());
    expect(await shares.create(owner, storeId, input, requestKey, key())).toEqual(result);
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Date.parse(result.expiresAt) - Date.parse(result.createdAt)).toBe(14 * 86400000);
    expect(result).toMatchObject({ employeeName: "员工", dateFrom: "2026-09-01", dateTo: "2026-09-01", totalIncomeCents: 3300 });
    const stored = await prisma.employeeSettlementShare.findUniqueOrThrow({ where: { tokenHash: createHash("sha256").update(result.token).digest("hex") } });
    expect(stored.tokenHash).not.toBe(result.token);
    const publicStatement = await shares.read(result.token);
    expect(publicStatement.snapshot).toMatchObject({ employee: { displayName: "员工" }, amountType: "TIP", summary: { totalIncomeCents: 3300 } });
    expect(publicStatement.snapshot).not.toHaveProperty("storeId");
    expect(publicStatement.snapshot).not.toHaveProperty("employee.membershipId");
    expect(publicStatement.snapshot).not.toHaveProperty("payment");
    await prisma.storeMembership.update({ where: { id: membershipId }, data: { displayName: "Changed" } });
    expect(await shares.read(result.token)).toEqual(publicStatement);
    await prisma.storeMembership.update({ where: { id: membershipId }, data: { displayName: "员工" } });
    await expect(shares.create(owner, storeId, { ...input, amountType: "ALL" }, requestKey, key())).rejects.toThrow(ConflictException);
    await prisma.employeeSettlementShare.update({ where: { id: stored.id }, data: { expiresAt: new Date(0) } });
    await expect(shares.read(result.token)).rejects.toThrow(NotFoundException);
    await expect(shares.read("a".repeat(43))).rejects.toThrow(NotFoundException);
  });

  it("创建需要工资管理权限且员工必须属于当前店铺", async () => {
    await expect(shares.create(employee, storeId, query("2026-09-01"), key(), key())).rejects.toThrow(ForbiddenException);
    await expect(shares.create(owner, storeId, { ...query("2026-09-01"), membershipId: randomUUID() }, key(), key())).rejects.toThrow(NotFoundException);
    const result = await shares.create(owner, storeId, query("2026-09-01"), key(), key());
    await prisma.store.update({ where: { id: storeId }, data: { deletedAt: new Date() } });
    await expect(shares.read(result.token)).rejects.toThrow(NotFoundException);
    await prisma.store.update({ where: { id: storeId }, data: { deletedAt: null } });
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

  it("折扣混付在确认、修改、个人日结、区间预览和现金结清中使用相同的折前工资拆分", async () => {
    const date = "2026-08-30";
    const created = await work.create(owner, storeId, { employeeMembershipId: membershipId, startAt: `${date}T16:00:00Z`, serviceItemId }, key(), key());
    const edited = await work.update(owner, storeId, created.id, {
      version: created.version, mainServiceAmountCents: 12_000,
      addons: [{ isCustom: true, name: "椰子油", shortName: "椰子油", amountCents: 1_000 }],
      discounts: [{ isCustom: true, name: "off5", amountCents: 500 }],
    }, key(), key());
    const paid = await work.confirmPayment(owner, storeId, created.id, {
      version: edited.version, cashServiceCents: 2_500, cardServiceCents: 10_000, cashTipCents: 3_500, cardTipCents: 0,
    }, key(), key());
    expect(paid).toMatchObject({ totalLargeFeeWageCents: 7_800n, employeeTotalIncomeCents: 11_300n, cashAllocatedServiceWageCents: 1_800n });
    const updated = await work.update(owner, storeId, created.id, { version: paid.version, note: "核对混合付款" }, key(), key());
    expect(updated.cashAllocatedServiceWageCents).toBe(1_800n);
    const personal = await closings.previewMember(employee, storeId, date, membershipId);
    expect(personal.employee).toMatchObject({ cashLargeFeeDividendCents: 1800, cardLargeFeeDividendCents: 6000, cashTipDividendCents: 3500 });
    expect((await preview(date)).summary).toMatchObject({ cashLargeFeeWageCents: 1800, nonCashLargeFeeWageCents: 6000, totalIncomeCents: 11300 });
    expect((await preview(date, date, "CASH")).payment.unsettledCents).toBe(5300);
    expect((await preview(date, date, "NON_CASH")).payment.unsettledCents).toBe(6000);
    const settled = await cash.settle(owner, storeId, date, membershipId, { version: 0 }, key(), key());
    expect(settled).toMatchObject({ cashAllocatedServiceWageCents: 1_800n, cashRetainedCents: 5_300n, cashToSubmitToStoreCents: 700n });
    expect((await preview(date)).payment.unsettledCents).toBe(6000);
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

  it("每日结清默认关闭，启用后保存完整工资快照；幂等、历史和取消同步工资日历", async () => {
    const before = await prisma.storeMembership.findUniqueOrThrow({ where: { id: membershipId } });
    expect(before.dailySettlementEnabled).toBe(false);
    await record("2026-09-12");
    expect((await closings.previewMember(owner, storeId, "2026-09-12", membershipId)).dailySettlementEnabled).toBe(false);
    const changed = await members.updateMember(owner, storeId, membershipId, { version: before.version, dailySettlementEnabled: true }, key());
    const personal = await closings.previewMember(employee, storeId, "2026-09-12", membershipId);
    expect(personal).toMatchObject({ dailySettlementEnabled: true, dailySettlementPayoutCents: 8300 });
    await expect(cash.settle(owner, storeId, "2026-09-12", membershipId, { version: 0, dailySettlementEnabled: false }, key(), key())).rejects.toBeInstanceOf(ConflictException);
    await expect(cash.settle(employee, storeId, "2026-09-12", membershipId, { version: 0 }, key(), key())).rejects.toBeInstanceOf(ForbiddenException);
    const beforeBalance = await finance.myBalance(employee, storeId);
    const requestKey = key();
    const paid = await cash.settle(owner, storeId, "2026-09-12", membershipId, { version: 0, dailySettlementEnabled: true }, requestKey, key());
    expect(paid).toMatchObject({ dailySettlementEnabled: true, additionalServiceWagePaidCents: 3600n, nonCashTipPaidCents: 2300n });
    expect((await cash.settle(owner, storeId, "2026-09-12", membershipId, { version: 0, dailySettlementEnabled: true }, requestKey, key())).id).toBe(paid.id);
    const afterBalance = await finance.myBalance(employee, storeId);
    expect(beforeBalance.rawBalanceCents - afterBalance.rawBalanceCents).toBe(9300n);
    expect((await preview("2026-09-12")).payment).toMatchObject({ unsettledCents: 0, fullyConfirmed: true });
    expect((await calendar()).days.find((d) => d.businessDate === "2026-09-12")).toMatchObject({ dailySettlementEnabled: true, cashSettled: true, nonCashSettled: true });
    await expect(confirm("2026-09-12")).rejects.toBeInstanceOf(ConflictException);
    const disabled = await members.updateMember(owner, storeId, membershipId, { version: changed.version, dailySettlementEnabled: false }, key());
    expect((await closings.previewMember(owner, storeId, "2026-09-12", membershipId))).toMatchObject({ dailySettlementEnabled: true, dailySettlementPayoutCents: 8300 });
    await cash.reopen(owner, storeId, "2026-09-12", membershipId, { version: paid.version }, key(), key());
    expect((await preview("2026-09-12")).payment.unsettledCents).toBe(9300);
    expect((await calendar()).days.find((d) => d.businessDate === "2026-09-12")).toMatchObject({ cashSettled: false, nonCashSettled: false });
    await members.updateMember(owner, storeId, membershipId, { version: disabled.version, dailySettlementEnabled: true }, key());
    const restored = await cash.settle(owner, storeId, "2026-09-12", membershipId, { version: paid.version + 1 }, key(), key());
    const row = await prisma.workRecord.findFirstOrThrow({ where: { storeId, businessDate: new Date("2026-09-12T00:00:00Z") } });
    await work.update(owner, storeId, row.id, { version: row.version, isHighlighted: true }, key(), key());
    expect((await preview("2026-09-12")).payment.unsettledCents).toBe(9300);
    expect(await prisma.dailyCashSettlement.findUnique({ where: { id: restored.id } })).toMatchObject({ status: "UNSETTLED" });
  });

  it("每日结清纳入礼物卡大费及小费；拒绝未结账记工和已有工资确认", async () => {
    const created = await work.create(owner, storeId, { employeeMembershipId: membershipId, startAt: "2026-09-13T16:00:00Z", serviceItemId }, key(), key());
    await expect(cash.settle(owner, storeId, "2026-09-13", membershipId, { version: 0 }, key(), key())).rejects.toBeInstanceOf(ConflictException);
    expect(await prisma.dailyCashSettlement.count({ where: { storeId, businessDate: new Date("2026-09-13T00:00:00Z") } })).toBe(0);
    await work.confirmPayment(owner, storeId, created.id, { version: created.version, cashServiceCents: 0, cardServiceCents: 0, cardTipCents: 0, giftCardServiceCents: 10000, giftCardTipCents: 500, cashTipCents: 700, giftCardSerialNumber: "DAILY-TEST" }, key(), key());
    expect((await closings.previewMember(owner, storeId, "2026-09-13", membershipId)).dailySettlementPayoutCents).toBe(6500);
    await cash.settleAll(owner, storeId, "2026-09-13", { settlements: [{ membershipId, version: 0, dailySettlementEnabled: true }] }, key(), key());
    expect((await preview("2026-09-13")).payment).toMatchObject({ unsettledCents: 0, fullyConfirmed: true });
    await record("2026-09-14");
    await confirm("2026-09-14", "2026-09-14", "NON_CASH");
    await expect(cash.settle(owner, storeId, "2026-09-14", membershipId, { version: 0 }, key(), key())).rejects.toBeInstanceOf(ConflictException);
    await record("2026-09-15");
    await cash.settle(owner, storeId, "2026-09-15", membershipId, { version: 0 }, key(), key());
    const closed = await closings.close(owner, storeId, "2026-09-15", { force: false }, key(), key());
    await closings.cancel(owner, storeId, "2026-09-15", { version: closed.closing.version }, key(), key());
    expect((await preview("2026-09-15")).payment).toMatchObject({ unsettledCents: 9300, fullyConfirmed: false });
  });

  it("分别支付小费与大费，重叠范围、删除恢复、编辑类型及日历保持一致", async () => {
    const settings = await prisma.storeMembership.findUniqueOrThrow({ where: { id: membershipId } });
    await members.updateMember(owner, storeId, membershipId, { version: settings.version, dailySettlementEnabled: false }, key());
    await record("2026-09-16");
    const base = { ...query("2026-09-16", "2026-09-16", "NON_CASH"), amountType: "TIP" as const };
    const tips = await payments.preview(owner, storeId, base);
    expect(tips.summary.totalIncomeCents).toBe(2300);
    expect(tips.payment.unsettledCents).toBe(2300);
    const paid = await payments.confirm(owner, storeId, { ...base, deductionCents: 0, revision: tips.payment.revision }, key(), key());
    expect(paid).toMatchObject({ amountType: "TIP", totalPaidCents: 2300n });
    expect((await payments.preview(owner, storeId, base)).payment.fullyConfirmed).toBe(true);
    expect((await preview("2026-09-16", "2026-09-16", "NON_CASH")).payment.unsettledCents).toBe(3600);
    expect((await calendar()).days.find(day => day.businessDate === "2026-09-16")?.nonCashSettled).toBe(false);
    const removed = await payroll.remove(owner, storeId, paid.id, { version: paid.version }, key(), key());
    expect((await preview("2026-09-16", "2026-09-16", "NON_CASH")).payment.unsettledCents).toBe(5900);
    const restored = await payroll.restore(owner, storeId, paid.id, { version: removed.version }, key(), key());
    const edited = await payroll.update(owner, storeId, paid.id, { version: restored.version, amountType: "SERVICE" }, key(), key());
    expect((await payments.preview(owner, storeId, base)).payment.unsettledCents).toBe(2300);
    await payroll.update(owner, storeId, paid.id, { version: edited.version, amountType: "TIP" }, key(), key());
    const wage = await payments.preview(owner, storeId, { ...base, amountType: "SERVICE" });
    await payments.confirm(owner, storeId, { ...base, amountType: "SERVICE", deductionCents: 0, revision: wage.payment.revision }, key(), key());
    expect((await calendar()).days.find(day => day.businessDate === "2026-09-16")?.nonCashSettled).toBe(true);
    await cash.settle(owner, storeId, "2026-09-16", membershipId, { version: 0, dailySettlementEnabled: false }, key(), key());
    const cashTips = await payments.preview(owner, storeId, { ...base, paymentScope: "CASH" });
    expect(cashTips.payment).toMatchObject({ unsettledCents: 0, fullyConfirmed: true });
    await expect(payments.confirm(owner, storeId, { ...base, amountType: "SERVICE", deductionCents: 0, revision: tips.payment.revision }, key(), key())).rejects.toBeInstanceOf(ConflictException);
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
