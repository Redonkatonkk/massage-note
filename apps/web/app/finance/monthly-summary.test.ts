import { expect, it } from "vitest";
import type { FinanceAnalyticsResponse } from "@massage-note/contracts";
import { monthlyAverageDays, monthlyChange, monthlyComparisonPeriods, monthlyQuery, monthlyRanges, shiftMonth } from "./monthly-summary";

it("compares a current partial month with the same dates in the previous month", () => {
  expect(monthlyRanges("2026-10", "2026-10-22")).toEqual({ dateFrom: "2026-10-01", dateTo: "2026-10-22", previousFrom: "2026-09-01", previousTo: "2026-09-22", partial: true });
  expect(monthlyRanges("2026-03", "2026-03-31").previousTo).toBe("2026-02-28");
  expect(monthlyRanges("2024-03", "2024-03-31").previousTo).toBe("2024-02-29");
});

it("compares completed calendar months including leap years and year boundaries", () => {
  expect(monthlyRanges("2024-02", "2026-10-22")).toEqual({ dateFrom: "2024-02-01", dateTo: "2024-02-29", previousFrom: "2024-01-01", previousTo: "2024-01-31", partial: false });
  expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  expect(shiftMonth("2025-12", 1)).toBe("2026-01");
});

it("uses all employees, payments and highlights for comparable monthly totals and exports", () => {
  expect(Object.fromEntries(monthlyQuery("2026-10-01", "2026-10-22"))).toEqual({ dateFrom: "2026-10-01", dateTo: "2026-10-22", paymentMethod: "ALL", amountType: "ALL", highlightFilter: "ALL" });
});

it("keeps cents and negative changes without inventing rates from zero or negative baselines", () => {
  expect(monthlyChange(12501, 10000).difference).toBe(2501);
  expect(monthlyChange(12501, 10000).percent).toBeCloseTo(25.01);
  expect(monthlyChange(-500, 1000)).toEqual({ difference: -1500, percent: -150 });
  expect(monthlyChange(100, 0).percent).toBeNull();
  expect(monthlyChange(100, -100).percent).toBeNull();
  expect(monthlyChange(0, 0).percent).toBe(0);
});

it("compares the selected month and the preceding two periods with short months and year boundaries", () => {
  expect(monthlyComparisonPeriods("2026-03", "2026-03-31").map(period => period.dateTo)).toEqual(["2026-03-31", "2026-02-28", "2026-01-31"]);
  expect(monthlyComparisonPeriods("2026-01", "2026-01-22").map(period => period.dateTo)).toEqual(["2026-01-22", "2025-12-22", "2025-11-22"]);
  expect(monthlyComparisonPeriods("2024-03", "2026-10-22").map(period => period.dateTo)).toEqual(["2024-03-31", "2024-02-29", "2024-01-31"]);
});

it("uses exact server 30-day averages and preserves missing dates, open days, and real zero", () => {
  const data = { days: [
    { businessDate: "2026-10-01", average30Cents: "1251", average30DayCount: 8 },
    { businessDate: "2026-10-02", average30Cents: null, average30DayCount: 0 },
    { businessDate: "2026-10-03", average30Cents: "0", average30DayCount: 1 },
  ] } as FinanceAnalyticsResponse;
  const days = monthlyAverageDays(data, "2026-10-01", "2026-10-04");
  expect(days.map(day => day?.average30Cents)).toEqual(["1251", null, "0", undefined]);
  expect(monthlyAverageDays(null, "2026-02-01", "2026-02-28")).toEqual(Array(28).fill(null));
});
