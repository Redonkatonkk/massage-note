import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { User } from "@massage-note/database";
import { PrismaService } from "../src/database/prisma.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";
import { FinanceAnalyticsService } from "../src/finance/finance-analytics.service.js";
const enabled = process.env.DATABASE_INTEGRATION_TESTS === "1";
const prisma = new PrismaService();
const service = new FinanceAnalyticsService(prisma, new StoreAccessService(prisma));
const storeId = randomUUID(), owner = randomUUID(), employee = randomUUID(), outsider = randomUUID();
const memberId = randomUUID(), employeeMember = randomUUID();
const actor = (id: string) => ({ id }) as User;
const date = new Date("2026-01-05T00:00:00Z");

describe.skipIf(!enabled).sequential("经营分析数据库与权限", () => {
  beforeAll(async () => {
    await prisma.user.createMany({ data: [owner, employee, outsider].map(id => ({ id, firebaseUid: `analytics-${id}`, phoneE164: `+1646${randomInt(1000000, 9999999)}` })) });
    await prisma.store.create({ data: { id: storeId, storeCode: randomInt(0, 1000000).toString().padStart(6, "0"), name: "经营分析测试", timezone: "America/New_York", businessCutoffLocal: "00:00", globalCommissionBps: 5000, status: "ACTIVE" } });
    await prisma.storeMembership.createMany({ data: [{ id: memberId, storeId, userId: owner, role: "OWNER", displayName: "老板", displayNameNormalized: "老板" }, { id: employeeMember, storeId, userId: employee, role: "EMPLOYEE", displayName: "员工", displayNameNormalized: "员工" }] });
    await prisma.workRecord.createMany({ data: [false, false, true].map((deleted, index) => ({ storeId, employeeMembershipId: memberId, businessDate: date, startAt: new Date("2026-01-05T15:30:00Z"), storeTimezoneSnapshot: "America/New_York", businessCutoffSnapshot: "00:00", status: index === 0 ? "CONFIRMED" : "PENDING_PAYMENT", mainServiceAmountCents: 10000n, grossFeeBaseCents: 10000n, discountedFeePerformanceCents: 10000n, mainServiceWageCents: 5000n, totalLargeFeeWageCents: 5000n, cashServiceCents: 10000n, cardServiceCents: 0n, giftCardServiceCents: 0n, cashTipCents: 0n, cardTipCents: 0n, giftCardTipCents: 0n, totalTipCents: 0n, actualServiceCollectedCents: 10000n, customerTotalPaidCents: 10000n, employeeTotalIncomeCents: 5000n, cashAllocatedServiceWageCents: 5000n, cashAcquiredServiceWageCents: 5000n, cashWageShortfallCents: 0n, createdBy: owner, updatedBy: owner, deletedAt: deleted ? new Date() : null })) });
    await prisma.giftCardSale.createMany({ data: [false, true].map((deleted, index) => ({ storeId, businessDate: date, serialNumber: `analytics-${index}`, serialNumberNormalized: `analytics-${index}`, faceValueCents: 5000n, amountCents: 4500n, discountCents: 500n, cashCents: 4500n, cardCents: 0n, operatorMembershipId: memberId, createdBy: owner, updatedBy: owner, deletedAt: deleted ? new Date() : null })) });
    await prisma.lostCustomer.createMany({ data: [
      { businessDate: new Date("2026-01-04T00:00:00Z"), occurredTime: "09:30", deletedAt: null },
      { businessDate: date, occurredTime: "10:30", deletedAt: null },
      { businessDate: date, occurredTime: "11:30", deletedAt: null },
      { businessDate: date, occurredTime: "12:30", deletedAt: new Date() },
    ].map(row => ({ storeId, ...row, createdBy: owner, updatedBy: owner })) });
  });
  afterAll(async () => {
    await prisma.businessDayClosing.deleteMany({ where: { storeId } });
    await prisma.giftCardSale.deleteMany({ where: { storeId } });
    await prisma.lostCustomer.deleteMany({ where: { storeId } });
    await prisma.workRecord.deleteMany({ where: { storeId } });
    await prisma.storeMembership.deleteMany({ where: { storeId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.user.deleteMany({ where: { id: { in: [owner, employee, outsider] } } });
    await prisma.$disconnect();
  });
  it("默认全部，含待结账，排除删除记工和卖卡，员工与跨店用户禁止访问", async () => {
    const result = await service.analytics(actor(owner), storeId, {});
    expect(result.dateFrom).toBe("2026-01-04");
    expect(result.hours[10]!.count).toBe(2);
    expect(result.days[0]).toMatchObject({ count: 0, lostCustomerCount: 1, revenueCents: null });
    expect(result.days[1]).toMatchObject({ count: 2, lostCustomerCount: 2, revenueCents: null });
    await expect(service.analytics(actor(employee), storeId, {})).rejects.toThrow();
    await expect(service.analytics(actor(outsider), storeId, {})).rejects.toThrow();
    await expect(service.analytics(actor(owner), storeId, { dateFrom: "2026-01-06", dateTo: "2026-01-05" })).rejects.toThrow();
  });
  it("默认起始日期包含跑客；仅跑客日期也可单独查询", async () => {
    const result = await service.analytics(actor(owner), storeId, { dateFrom: "2026-01-06", dateTo: "2026-01-06" });
    expect(result.hasData).toBe(false);
    expect(result.days[0]!.lostCustomerCount).toBe(0);
    const onlyLost = await service.analytics(actor(owner), storeId, { dateFrom: "2026-01-04", dateTo: "2026-01-04" });
    expect(onlyLost.hasData).toBe(true);
    expect(onlyLost.days[0]).toMatchObject({ count: 0, lostCustomerCount: 1, revenueCents: null });
  });
  it("已日结金额包含有效卖卡且去重，取消后恢复缺口", async () => {
    const closing = await prisma.businessDayClosing.create({ data: { storeId, businessDate: date, status: "CLOSED", closedBy: owner, cycleNo: 1, totalsSnapshotJson: {}, warningSnapshotJson: [] } });
    const result = await service.analytics(actor(owner), storeId, { dateFrom: "2026-01-05", dateTo: "2026-01-05" });
    expect(result.days[0]!.revenueCents).toBe("24500");
    expect(result.weekdays[0]!.closedDayCount).toBe(1);
    await prisma.businessDayClosing.update({ where: { id: closing.id }, data: { status: "CANCELLED" } });
    expect((await service.analytics(actor(owner), storeId, { dateFrom: "2026-01-05", dateTo: "2026-01-05" })).days[0]!.revenueCents).toBeNull();
  });
});
