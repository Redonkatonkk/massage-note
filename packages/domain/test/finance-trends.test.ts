import { expect, it } from "vitest";
import { calculateFinanceTrends } from "../src/finance-trends.js";

type Input = Parameters<typeof calculateFinanceTrends>[0];
type Record = Input["records"][number];
const record = (businessDate: string, revenue = 10000n, changes: Partial<Record> = {}): Record => ({
  businessDate, role: "EMPLOYEE", isHighlighted: false, discountedFeePerformanceCents: revenue < 0n ? 0n : revenue,
  totalLargeFeeWageCents: 0n, cardServiceCents: 0n, giftCardServiceCents: revenue < 0n ? -revenue : 0n,
  cashTipCents: 0n, cardTipCents: 0n, giftCardTipCents: 0n, ...changes,
});
const input = (changes: Partial<Input> = {}): Input => ({ dateTo: "2026-10-07", closedDates: ["2026-09-30", "2026-10-07"], records: [], sales: [], ...changes });

it("最近日结截止、跨年七天边界、去重日结及空日结分母，未日结和未来数据不混入", () => {
  const result = calculateFinanceTrends(input({ dateTo: "2026-01-10",
    closedDates: ["2025-12-24", "2025-12-30", "2025-12-31", "2026-01-02", "2026-01-06", "2026-01-06", "2026-01-11"],
    records: [record("2025-12-24", 10000n), record("2025-12-30", 30000n), record("2025-12-31", 50000n), record("2026-01-06", 70000n), record("2026-01-03", 999999n), record("2026-01-11", 999999n)],
  }))!;
  expect(result.asOf).toBe("2026-01-06");
  expect(result.revenue7).toMatchObject({
    current: { dateFrom: "2025-12-31", dateTo: "2026-01-06", closedDayCount: 3, value: "40000" },
    previous: { dateFrom: "2025-12-24", dateTo: "2025-12-30", closedDayCount: 2, value: "20000" },
    changeTenthsPercent: 1000, direction: "UP", status: "COMPARABLE",
  });
});

it("三十天按自然日窗口跨闰月，与之前三十天不重叠且不延伸", () => {
  const result = calculateFinanceTrends(input({ dateTo: "2024-03-01",
    closedDates: ["2024-01-01", "2024-01-02", "2024-01-31", "2024-02-01", "2024-02-29", "2024-03-01"],
    records: [record("2024-01-01", 999999n), record("2024-01-02", 10000n), record("2024-01-31", 20000n), record("2024-02-01", 30000n), record("2024-02-29", 40000n), record("2024-03-01", 50000n)],
  }))!;
  expect(result.revenue30.current).toEqual({ dateFrom: "2024-02-01", dateTo: "2024-03-01", closedDayCount: 3, value: "40000" });
  expect(result.revenue30.previous).toEqual({ dateFrom: "2024-01-02", dateTo: "2024-01-31", closedDayCount: 2, value: "15000" });
  expect(result.records30.current.value).toBe("1.0");
  expect(result.income30.current.value).toBe("120000");
});

it("环比使用未舍入日均，不能用已舍入的美分重新计算", () => {
  const result = calculateFinanceTrends(input({ closedDates: ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-07"], records: [record("2026-09-30", 1n), record("2026-10-07", 1n)] }))!;
  expect(result.revenue7.current.value).toBe("0");
  expect(result.revenue7.previous.value).toBe("1");
  expect(result.revenue7.changeTenthsPercent).toBe(-333);
  expect(result.records30.current.value).toBe("0.4");
});

it("手续费在整个窗口合并舍入，不能逐日相加", () => {
  const result = calculateFinanceTrends(input({ dateTo: "2026-10-02", closedDates: ["2026-10-01", "2026-10-02"],
    records: [record("2026-10-01", 20n, { cardServiceCents: 20n }), record("2026-10-02", 20n, { cardServiceCents: 20n })],
  }))!;
  expect(result.income30.current.value).toBe("39");
  expect(result.income30.status).toBe("NO_BASELINE");
});

it("三种高光条件统一作用于全部指标，卖卡不增单量，仅高光排除卖卡", () => {
  const data = input({ records: [record("2026-10-07", 4000n, { isHighlighted: true }), record("2026-10-07", 6000n)],
    sales: [{ businessDate: "2026-10-07", amountCents: 1000n, cashCents: 1000n, cardCents: 0n }],
  });
  for (const [highlightFilter, revenue, count] of [["ALL", "11000", "1.0"], ["ONLY_HIGHLIGHTED", "4000", "0.5"], ["EXCLUDE_HIGHLIGHTED", "7000", "0.5"]] as const) {
    const result = calculateFinanceTrends({ ...data, highlightFilter })!;
    expect(result.revenue7.current.value).toBe(revenue);
    expect(result.records30.current.value).toBe(count);
    expect(result.income30.current.value).toBe(revenue);
    expect(result.records30.current.closedDayCount).toBe(2);
  }
});

it("总收入加回店长经理收入、扣礼卡核销和刷卡手续费，允许负值", () => {
  const result = calculateFinanceTrends(input({ closedDates: ["2026-10-07"], records: [
    record("2026-10-07", 10000n, { role: "OWNER", totalLargeFeeWageCents: 6000n, cashTipCents: 100n, cardTipCents: 200n, giftCardTipCents: 300n, giftCardServiceCents: 1000n, cardServiceCents: 5000n }),
    record("2026-10-07", 5000n, { role: "MANAGER", totalLargeFeeWageCents: 3000n, isHighlighted: true, cardServiceCents: 1n }),
    record("2026-10-07", 5000n, { totalLargeFeeWageCents: 2000n }),
  ], sales: [{ businessDate: "2026-10-07", amountCents: 950n, cashCents: 0n, cardCents: 950n }] }))!;
  // Before fees: 20000 - 1000 + 100 + 200 + 950 - 2000 = 18250.
  // Fees: (5000 + 200) * 2.5% + 300 = 430; sale card receipts are excluded.
  expect(result.income30.current.value).toBe("17820");
});

it.each([
  [0n, 0n, "COMPARABLE", 0, "FLAT"], [0n, 100n, "NEW", null, "UP"], [0n, -100n, "ZERO_BASELINE", null, "DOWN"],
  [-100n, 100n, "NEGATIVE_BASELINE", null, "UP"], [100n, 0n, "COMPARABLE", -1000, "DOWN"],
])("基期和当前为 %s/%s 时解释百分比，而非生成无穷大或反向增长", (previous, current, status, percent, direction) => {
  const result = calculateFinanceTrends(input({ records: [record("2026-09-30", previous), record("2026-10-07", current)] }))!;
  expect(result.revenue7).toMatchObject({ status, changeTenthsPercent: percent, direction });
});

it("历史不足保留当前值但不冒充新增，无日结或仅未来日结返回空趋势", () => {
  const result = calculateFinanceTrends(input({ closedDates: ["2026-10-07"], records: [record("2026-10-07")] }))!;
  expect(result.revenue7).toMatchObject({ current: { value: "10000" }, previous: { value: null }, status: "NO_BASELINE", changeTenthsPercent: null });
  expect(calculateFinanceTrends(input({ closedDates: [] }))).toBeNull();
  expect(calculateFinanceTrends(input({ closedDates: ["2026-10-08"] }))).toBeNull();
});
