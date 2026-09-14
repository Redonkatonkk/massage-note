import { expect, it, vi } from "vitest";
import { FinanceQueriesService } from "../src/finance/finance-queries.service.js";

it("所选范围平均值只包含已日结折后业绩，包含卖卡但排除小费并保留零营业额日结", async () => {
  const closedDates = vi.fn().mockResolvedValue([
    { businessDate: new Date("2026-09-01") },
    { businessDate: new Date("2026-09-03") },
  ]);
  const prisma = {
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
