import { expect, it, vi } from "vitest";
import { FinanceQueriesService } from "../src/finance/finance-queries.service.js";

it("所选范围平均值只包含已日结折后业绩，包含卖卡但排除小费并保留零营业额日结", async () => {
  const closedDates = vi.fn().mockResolvedValue([
    { businessDate: new Date("2026-09-01") },
    { businessDate: new Date("2026-09-03") },
  ]);
  const prisma = {
    workRecord: { groupBy: vi.fn().mockResolvedValue([]) },
    giftCardSale: { groupBy: vi.fn().mockResolvedValue([]) },
    storeMembership: { findMany: vi.fn().mockResolvedValue([]) },
    businessDayClosing: { findMany: closedDates },
    payrollSettlement: { aggregate: vi.fn().mockResolvedValue({ _sum: {} }) },
    dailyCashSettlement: { aggregate: vi.fn().mockResolvedValue({ _sum: {} }) },
  };
  const service = new FinanceQueriesService(prisma as never, {} as never);
  const internals = service as unknown as {
    resolveQueryContext: () => Promise<unknown>;
    findGiftCardSales: () => Promise<unknown>;
    findRecords: () => Promise<unknown>;
  };
  const query = { membershipIds: [] as string[], dateFrom: "2026-09-01", dateTo: "2026-09-03", paymentMethod: "ALL", amountType: "ALL", highlightFilter: "ALL" } as const;
  vi.spyOn(internals, "resolveQueryContext").mockResolvedValue({ ...query, query, membershipIds: [] } as never);
  vi.spyOn(internals, "findGiftCardSales").mockResolvedValue([
    { businessDate: new Date("2026-09-01"), cashCents: 90000n, cardCents: 0n },
  ] as never);
  vi.spyOn(internals, "findRecords").mockResolvedValue(["2026-09-01", "2026-09-02"].map(day => ({
    employeeMembershipId: "employee", employee: { displayName: "Employee", role: "EMPLOYEE" },
    businessDate: new Date(day), status: "CONFIRMED", isHighlighted: false,
    mainServiceAmountCents: 10000n, addonTotalCents: 0n, grossFeeBaseCents: 10000n,
    discountTotalCents: 599n, discountedFeePerformanceCents: 9401n,
    actualServiceCollectedCents: 9401n, cashServiceCents: 9401n, cardServiceCents: 0n, giftCardServiceCents: 0n,
    cashTipCents: 1000n, cardTipCents: 0n, giftCardTipCents: 0n,
    totalLargeFeeWageCents: 5000n, cashAllocatedServiceWageCents: 5000n, cashAcquiredServiceWageCents: 5000n,
  })) as never);
  const read = () => service.summary({} as never, "store", query);
  expect((await read()).totals).toMatchObject({ averageRevenueCents: 49701n, averageRevenueDayCount: 2 });
  expect(closedDates).toHaveBeenCalledWith({
    where: { storeId: "store", businessDate: { gte: new Date("2026-09-01"), lte: new Date("2026-09-03") }, status: "CLOSED" },
    select: { businessDate: true }, distinct: ["businessDate"],
  });
  closedDates.mockResolvedValue([{ businessDate: new Date("2026-09-01") }]);
  expect((await read()).totals).toMatchObject({ averageRevenueCents: 99401n, averageRevenueDayCount: 1 });
  closedDates.mockResolvedValue([]);
  expect((await read()).totals).toMatchObject({ averageRevenueCents: null, averageRevenueDayCount: 0 });
});


it("每日30天基准跨筛选起点，排除窗口外和未日结日期，含卖卡、零日结与美分舍入", async () => {
  const day = (date: string) => new Date(date);
  const prisma = {
    businessDayClosing: { findMany: vi.fn().mockResolvedValue([
      { businessDate: day("2026-08-15") }, { businessDate: day("2026-08-16") },
      { businessDate: day("2026-09-14") },
    ]) },
    workRecord: { groupBy: vi.fn().mockResolvedValue([
      { businessDate: day("2026-08-15"), _sum: { discountedFeePerformanceCents: 999999n } },
      { businessDate: day("2026-08-16"), _sum: { discountedFeePerformanceCents: 10000n } },
      { businessDate: day("2026-09-13"), _sum: { discountedFeePerformanceCents: 999999n } },
    ]) },
    giftCardSale: { groupBy: vi.fn().mockResolvedValue([
      { businessDate: day("2026-08-16"), _sum: { amountCents: 501n } },
    ]) },
  };
  const service = new FinanceQueriesService(prisma as never, {} as never);
  const internal = service as unknown as { recentDailyRevenue: (storeId: string, dates: string[], client: unknown) => Promise<Map<string, unknown>> };
  const result = await internal.recentDailyRevenue("store", ["2026-09-14", "2026-09-13"], prisma);
  expect(result.get("2026-09-14")).toEqual({ averageCents: 5251n, dayCount: 2 });
  expect(result.has("2026-09-13")).toBe(false);
  expect(prisma.workRecord.groupBy).toHaveBeenCalledWith({
    by: ["businessDate"], where: { storeId: "store", businessDate: { gte: day("2026-08-15"), lte: day("2026-09-14") }, deletedAt: null },
    _sum: { discountedFeePerformanceCents: true },
  });
  prisma.businessDayClosing.findMany.mockResolvedValue([]);
  expect((await internal.recentDailyRevenue("store", ["2026-09-14"], prisma)).size).toBe(0);
});
