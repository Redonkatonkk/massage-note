import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { User } from "@massage-note/database";
import { PrismaService } from "../src/database/prisma.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";
import { FinanceAnalyticsService } from "../src/finance/finance-analytics.service.js";
import { FinanceQueriesService } from "../src/finance/finance-queries.service.js";
import { BoardsService } from "../src/boards/boards.service.js";
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
    await prisma.workRecord.createMany({ data: [false, false, true].map((deleted, index) => ({ storeId, employeeMembershipId: memberId, businessDate: date, startAt: new Date("2026-01-05T15:30:00Z"), storeTimezoneSnapshot: "America/New_York", businessCutoffSnapshot: "00:00", status: index === 0 ? "CONFIRMED" : "PENDING_PAYMENT", isHighlighted: index > 0, mainServiceAmountCents: 10000n, grossFeeBaseCents: 10000n, discountedFeePerformanceCents: 10000n, mainServiceWageCents: 5000n, totalLargeFeeWageCents: 5000n, cashServiceCents: 10000n, cardServiceCents: 0n, giftCardServiceCents: 0n, cashTipCents: 0n, cardTipCents: 0n, giftCardTipCents: 0n, totalTipCents: 0n, actualServiceCollectedCents: 10000n, customerTotalPaidCents: 10000n, employeeTotalIncomeCents: 5000n, cashAllocatedServiceWageCents: 5000n, cashAcquiredServiceWageCents: 5000n, cashWageShortfallCents: 0n, createdBy: owner, updatedBy: owner, deletedAt: deleted ? new Date() : null })) });
    await prisma.giftCardSale.createMany({ data: [false, true].map((deleted, index) => ({ storeId, businessDate: date, serialNumber: `analytics-${index}`, serialNumberNormalized: `analytics-${index}`, faceValueCents: 5000n, amountCents: 4500n, discountCents: 500n, cashCents: 4500n, cardCents: 0n, operatorMembershipId: memberId, createdBy: owner, updatedBy: owner, deletedAt: deleted ? new Date() : null })) });
    await prisma.lostCustomer.createMany({ data: [
      { businessDate: new Date("2026-01-04T00:00:00Z"), occurredTime: "09:30", deletedAt: null },
      { businessDate: date, occurredTime: "10:30", customerCount: 3, deletedAt: null },
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
    expect(result.days[1]).toMatchObject({ count: 2, lostCustomerCount: 4, revenueCents: null });
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
  it("三种高亮筛选统一作用于数量、热力、营业额及平均，仅高亮排除卖卡，跑客不变", async () => {
    const closing = await prisma.businessDayClosing.create({ data: { storeId, businessDate: date, status: "CLOSED", closedBy: owner, cycleNo: 1, totalsSnapshotJson: {}, warningSnapshotJson: [] } });
    for (const [highlightFilter, count, revenueCents] of [["ALL", 2, "24500"], ["ONLY_HIGHLIGHTED", 1, "10000"], ["EXCLUDE_HIGHLIGHTED", 1, "14500"]] as const) {
      const result = await service.analytics(actor(owner), storeId, { dateFrom: "2026-01-05", dateTo: "2026-01-05", highlightFilter });
      expect(result.hours[10]!.count).toBe(count);
      expect(result.days[0]).toMatchObject({ count, lostCustomerCount: 4, revenueCents, averageCents: revenueCents, averageDayCount: 1 });
      expect(result.days[0]!.hours[10]).toBe(count);
      expect(result.weekdays[0]).toMatchObject({ closedDayCount: 1, calendarDayCount: 1, averageCents: revenueCents });
      expect(result.weekdays[0]!.hours[10]).toBe(count);
      expect(result.weekdayComparison.weekdays[0]).toEqual({ weekday: 0, closedDayCount: 1, highlightedAverageCents: "10000", nonHighlightedAverageCents: "14500", averageCents: "24500" });
      expect(result.weekdayComparison.days[0]).toEqual({ businessDate: "2026-01-05", highlightedRevenueCents: "10000", nonHighlightedRevenueCents: "14500", revenueCents: "24500" });
      await expect(service.analytics(actor(employee), storeId, { highlightFilter })).rejects.toThrow();
      await expect(service.analytics(actor(outsider), storeId, { highlightFilter })).rejects.toThrow();
    }
    await prisma.businessDayClosing.update({ where: { id: closing.id }, data: { status: "CANCELLED" } });
    expect((await service.analytics(actor(owner), storeId, { dateFrom: "2026-01-05", dateTo: "2026-01-05" })).days[0]!.revenueCents).toBeNull();
    expect((await service.analytics(actor(owner), storeId, { dateFrom: "2026-01-05", dateTo: "2026-01-05" })).weekdayComparison.weekdays[0]).toMatchObject({ closedDayCount: 0, highlightedAverageCents: null, nonHighlightedAverageCents: null, averageCents: null });
  });
  it("三种筛选的30天窗口读取起日前29天，7天窗口及累计平均保留各自边界", async () => {
    const template = await prisma.workRecord.findFirstOrThrow({ where: { storeId, deletedAt: null, isHighlighted: false } });
    await prisma.workRecord.createMany({ data: ([
      ["2025-12-06", true, 900000n], ["2025-12-07", true, 60000n], ["2025-12-07", false, 20000n], ["2025-12-29", false, 10000n],
    ] as const).map(([businessDate, isHighlighted, revenueCents]) => ({
      ...template, id: randomUUID(), businessDate: new Date(`${businessDate}T00:00:00Z`),
      startAt: new Date(`${businessDate}T15:00:00Z`), isHighlighted,
      mainServiceAmountCents: revenueCents, grossFeeBaseCents: revenueCents, discountedFeePerformanceCents: revenueCents,
      cashServiceCents: revenueCents, actualServiceCollectedCents: revenueCents, customerTotalPaidCents: revenueCents,
      mainServiceWageCents: revenueCents / 2n, totalLargeFeeWageCents: revenueCents / 2n, employeeTotalIncomeCents: revenueCents / 2n,
      cashAllocatedServiceWageCents: revenueCents / 2n, cashAcquiredServiceWageCents: revenueCents / 2n,
    })) });
    await prisma.businessDayClosing.createMany({ data: ["2025-12-06", "2025-12-07", "2025-12-29", "2025-12-30", "2026-01-05"].map(businessDate => ({ storeId, businessDate: new Date(`${businessDate}T00:00:00Z`), status: "CLOSED", closedBy: owner, cycleNo: businessDate === "2026-01-05" ? 2 : 1, totalsSnapshotJson: {}, warningSnapshotJson: [] })) });
    for (const [highlightFilter, average30Cents, averageCents, cumulativeAverageCents] of [
      ["ALL", "28625", "12250", "24500"], ["ONLY_HIGHLIGHTED", "17500", "5000", "10000"], ["EXCLUDE_HIGHLIGHTED", "11125", "7250", "14500"],
    ] as const) {
      const result = await service.analytics(actor(owner), storeId, { dateFrom: "2026-01-05", dateTo: "2026-01-05", highlightFilter });
      expect(result.days).toHaveLength(1);
      expect(result.days[0]).toMatchObject({ average30Cents, average30DayCount: 4, averageCents, averageDayCount: 2, cumulativeAverageCents, cumulativeAverageDayCount: 1 });
    }
  });

  it("跨日卖卡及混合用卡在看板、日历、经营分析和平均中只计一次，核销小费与工资不变", async () => {
    const access = new StoreAccessService(prisma);
    const boards = new BoardsService(prisma, access, {} as never);
    const finance = new FinanceQueriesService(prisma, access);
    const template = await prisma.workRecord.findFirstOrThrow({ where: { storeId, businessDate: date, deletedAt: null, isHighlighted: false } });
    const redemptionDate = new Date("2026-01-20T00:00:00Z");
    await prisma.workRecord.createMany({ data: [
      { isHighlighted: false, giftCardServiceCents: 10000n, cashServiceCents: 0n, giftCardTipCents: 2000n, deletedAt: null },
      { isHighlighted: true, giftCardServiceCents: 6000n, cashServiceCents: 4000n, giftCardTipCents: 500n, deletedAt: null },
      { isHighlighted: false, giftCardServiceCents: 3000n, cashServiceCents: 7000n, giftCardTipCents: 0n, deletedAt: new Date() },
    ].map(row => ({ ...template, ...row, id: randomUUID(), businessDate: redemptionDate, startAt: new Date("2026-01-20T15:00:00Z"),
      giftCardSerialNumber: row.isHighlighted ? "legacy-card" : "redemption-sale",
      cashAllocatedServiceWageCents: row.cashServiceCents / 2n, cashAcquiredServiceWageCents: row.cashServiceCents / 2n,
      totalTipCents: row.giftCardTipCents, customerTotalPaidCents: 10000n + row.giftCardTipCents,
      employeeTotalIncomeCents: 5000n + row.giftCardTipCents,
    })) });
    await prisma.giftCardSale.create({ data: { storeId, businessDate: new Date("2026-01-19T00:00:00Z"),
      serialNumber: "redemption-sale", serialNumberNormalized: "redemption-sale", faceValueCents: 10000n,
      amountCents: 9500n, discountCents: 500n, cashCents: 9500n, cardCents: 0n,
      operatorMembershipId: memberId, createdBy: owner, updatedBy: owner,
    } });
    await prisma.businessDayClosing.createMany({ data: ["2026-01-19", "2026-01-20"].map(day => ({ storeId,
      businessDate: new Date(`${day}T00:00:00Z`), status: "CLOSED", closedBy: owner, cycleNo: 1,
      totalsSnapshotJson: {}, warningSnapshotJson: [],
    })) });
    const dates = { dateFrom: "2026-01-19", dateTo: "2026-01-20" };
    const calendar = await boards.openWorkDates(actor(owner), storeId, dates);
    expect(calendar.closedDates.map(row => row.revenueCents)).toEqual([9500n, 4000n]);
    expect((await boards.getBoard(actor(owner), storeId, dates.dateTo)).statistics).toMatchObject({
      discountedFeePerformanceCents: 20000n, revenueCents: 4000n, storeIncomeCents: -8500n,
      employeeIncomeCents: 12500n, totalIncomeCents: 4000n,
    });
    const summary = await finance.summary(actor(owner), storeId, { ...dates, membershipIds: [], paymentMethod: "ALL", amountType: "ALL", highlightFilter: "ALL" });
    expect(summary.totals).toMatchObject({ averageRevenueCents: 6750n, averageRevenueDayCount: 2,
      totalTurnoverCents: 11000n, storeIncomeCents: 1000n, employeeIncomeCents: 12500n,
    });
    for (const [highlightFilter, saleRevenue, redemptionRevenue] of [["ALL", "9500", "4000"], ["ONLY_HIGHLIGHTED", "0", "4000"], ["EXCLUDE_HIGHLIGHTED", "9500", "0"]] as const) {
      const result = await service.analytics(actor(owner), storeId, { ...dates, highlightFilter });
      expect(result.days.map(row => row.revenueCents)).toEqual([saleRevenue, redemptionRevenue]);
      expect(result.days[1]!.averageCents).toBe(highlightFilter === "ALL" ? "6750" : highlightFilter === "ONLY_HIGHLIGHTED" ? "2000" : "4750");
      expect(result.weekdayComparison.days[1]).toMatchObject({ highlightedRevenueCents: "4000", nonHighlightedRevenueCents: "0", revenueCents: "4000" });
    }
  });
  it("顶部趋势独立于起日，以最近日结锚定、只取已日结样本，并与整窗财务扣费汇总一致", async () => {
    const finance = new FinanceQueriesService(prisma, new StoreAccessService(prisma));
    const template = await prisma.workRecord.findFirstOrThrow({ where: { storeId, businessDate: date, deletedAt: null, isHighlighted: false } });
    const record = (businessDate: string, performance: bigint, wage: bigint, card: bigint, employeeMembershipId = memberId, isHighlighted = false) => ({
      ...template, id: randomUUID(), businessDate: new Date(`${businessDate}T00:00:00Z`), startAt: new Date(`${businessDate}T15:00:00Z`), employeeMembershipId, isHighlighted,
      mainServiceAmountCents: performance, grossFeeBaseCents: performance, discountedFeePerformanceCents: performance,
      mainServiceWageCents: wage, totalLargeFeeWageCents: wage, employeeTotalIncomeCents: wage,
      cashServiceCents: performance - card, cardServiceCents: card, actualServiceCollectedCents: performance, customerTotalPaidCents: performance,
      cashAllocatedServiceWageCents: wage, cashAcquiredServiceWageCents: wage,
    });
    const deleted = { ...record("2024-12-31", 900000n, 100n, 0n), deletedAt: new Date() };
    const placeholder = { ...record("2024-12-31", 0n, 0n, 0n), status: "PLACEHOLDER" as const,
      cashServiceCents: null, cardServiceCents: null, giftCardServiceCents: null,
      cashTipCents: null, cardTipCents: null, giftCardTipCents: null, totalTipCents: null,
      actualServiceCollectedCents: null, customerTotalPaidCents: null, employeeTotalIncomeCents: null,
      cashAllocatedServiceWageCents: null, cashAcquiredServiceWageCents: null, cashWageShortfallCents: null,
    };
    await prisma.workRecord.createMany({ data: [
      record("2024-11-30", 10000n, 4000n, 0n, employeeMember),
      record("2024-12-30", 10000n, 6000n, 20n), record("2024-12-31", 5000n, 2000n, 20n, employeeMember),
      record("2024-12-31", 1000n, 500n, 1000n, memberId, true), deleted, placeholder,
    ] });
    await prisma.businessDayClosing.createMany({ data: ["2024-11-30", "2024-12-30", "2024-12-31"].map(businessDate => ({ storeId, businessDate: new Date(`${businessDate}T00:00:00Z`), status: "CLOSED", closedBy: owner, cycleNo: 1, totalsSnapshotJson: {}, warningSnapshotJson: [] })) });
    const serial = randomUUID();
    await prisma.giftCardSale.create({ data: { storeId, businessDate: new Date("2024-12-31T00:00:00Z"), serialNumber: serial, serialNumberNormalized: serial, faceValueCents: 1000n, amountCents: 950n, discountCents: 50n, cashCents: 500n, cardCents: 450n, operatorMembershipId: memberId, createdBy: owner, updatedBy: owner } });
    for (const [highlightFilter, income] of [["ALL", "14649"], ["ONLY_HIGHLIGHTED", "700"], ["EXCLUDE_HIGHLIGHTED", "13949"]] as const) {
      const result = await service.analytics(actor(owner), storeId, { dateFrom: "2024-12-31", dateTo: "2024-12-31", highlightFilter });
      const summary = await finance.summary(actor(owner), storeId, { dateFrom: "2024-12-02", dateTo: "2024-12-31", membershipIds: [], paymentMethod: "ALL", amountType: "ALL", highlightFilter });
      expect(result.trends).toMatchObject({ asOf: "2024-12-31", income30: {
        current: { dateFrom: "2024-12-02", dateTo: "2024-12-31", closedDayCount: 2, value: income },
        previous: { dateFrom: "2024-11-02", dateTo: "2024-12-01", closedDayCount: 1 },
      } });
      expect(result.trends!.income30.current.value).toBe(summary.totals.totalIncomeCents.toString());
      if (highlightFilter === "ALL") {
        expect(result.trends!.records30).toMatchObject({ current: { value: "1.5" }, previous: { value: "1.0" }, changeTenthsPercent: 500 });
        expect(result.trends!.revenue30.current.value).toBe("8475");
        expect(result.trends!.revenue7.status).toBe("NO_BASELINE");
        expect(result.trends!.income30.previous.value).toBe("6000");
      }
    }
    // Open-day work must affect neither the anchor nor the fixed closed-day windows.
    await prisma.workRecord.create({ data: record("2024-12-29", 900000n, 0n, 0n) });
    const openExcluded = await service.analytics(actor(owner), storeId, { dateFrom: "2024-12-31", dateTo: "2025-01-01" });
    expect(openExcluded.trends!.asOf).toBe("2024-12-31");
    expect(openExcluded.trends!.income30.current.value).toBe("14649");
    const historical = await service.analytics(actor(owner), storeId, { dateFrom: "2024-12-29", dateTo: "2024-12-29" });
    expect(historical.trends!.asOf).toBe("2024-11-30");
    expect(historical.trends!.records30.current).toMatchObject({ closedDayCount: 1, value: "1.0" });
    expect((await service.analytics(actor(owner), storeId, { dateFrom: "2024-01-01", dateTo: "2024-01-01" })).trends).toBeNull();
    await prisma.businessDayClosing.create({ data: { storeId, businessDate: new Date("2024-12-28T00:00:00Z"), status: "CLOSED", closedBy: owner, cycleNo: 1, totalsSnapshotJson: {}, warningSnapshotJson: [] } });
    const emptyClosed = await service.analytics(actor(owner), storeId, { dateFrom: "2024-12-31", dateTo: "2024-12-31" });
    expect(emptyClosed.trends!.revenue30.current).toMatchObject({ closedDayCount: 3, value: "5650" });
    expect(emptyClosed.trends!.records30.current.value).toBe("1.0");
  });
});
