import { expect, it } from "vitest";
import { groupIncomePeriods, type IncomePeriod } from "./analytics-income-periods";

const day = (businessDate: string, dailyTurnoverCents: number, storeIncomeCents: number, totalIncomeCents: number) => ({ businessDate, dailyTurnoverCents, storeIncomeCents, totalIncomeCents });


it("自然周跨年按周一分界，仅合计所选区间并保留三项独立金额", () => {
  const result = groupIncomePeriods([
    day("2025-12-30", 99999, 99999, 99999), day("2026-01-07", 99999, 99999, 99999),
    day("2026-01-05", 30000, -1500, 2000), day("2026-01-04", 20002, 4000, 15000), day("2025-12-31", 10001, 3000, 8000),
  ], "2025-12-31", "2026-01-06", "WEEK");
  expect(result).toEqual([
    { label: "2025-12-31", from: "2025-12-31", to: "2026-01-04", turnoverCents: 30003, storeIncomeCents: 7000, totalIncomeCents: 23000 },
    { label: "2026-01-05", from: "2026-01-05", to: "2026-01-06", turnoverCents: 30000, storeIncomeCents: -1500, totalIncomeCents: 2000 },
  ]);
});

it("自然月包含闰日，月末不延伸到日期范围之外", () => {
  expect(groupIncomePeriods([day("2024-02-29", 100, 200, 300), day("2024-03-01", 400, 500, 600)], "2024-02-28", "2024-03-02", "MONTH")).toEqual([
    { label: "2024-02", from: "2024-02-28", to: "2024-02-29", turnoverCents: 100, storeIncomeCents: 200, totalIncomeCents: 300 },
    { label: "2024-03", from: "2024-03-01", to: "2024-03-02", turnoverCents: 400, storeIncomeCents: 500, totalIncomeCents: 600 },
  ]);
});

it("空日期及空周补零，三种周期都保持服务端金额的总和与负值", () => {
  const days = [day("2026-03-07", 10001, -2001, 5001), day("2026-03-23", 30002, 6003, 9004)];
  for (const period of ["DAY", "WEEK", "MONTH"] as IncomePeriod[]) {
    const result = groupIncomePeriods(days, "2026-03-07", "2026-03-23", period);
    expect(result.reduce((totals, row) => totals.map((sum, index) => sum + [row.turnoverCents, row.storeIncomeCents, row.totalIncomeCents][index]!), [0, 0, 0])).toEqual([40003, 4002, 14005]);
  }
  const daily = groupIncomePeriods(days, "2026-03-07", "2026-03-23", "DAY");
  expect(daily).toHaveLength(17);
  expect(daily[1]).toMatchObject({ from: "2026-03-08", to: "2026-03-08", turnoverCents: 0, storeIncomeCents: 0, totalIncomeCents: 0 });
  expect(groupIncomePeriods(days, "2026-03-07", "2026-03-23", "WEEK")[1]).toMatchObject({ from: "2026-03-09", to: "2026-03-15", turnoverCents: 0 });
});
