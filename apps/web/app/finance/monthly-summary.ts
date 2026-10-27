import type { FinanceAnalyticsResponse } from "@massage-note/contracts";
import type { FinanceSummaryResponse } from "../../lib/types";

export type MonthlyHighlightFilter = FinanceSummaryResponse["filters"]["highlightFilter"];

export function shiftMonth(month: string, offset: number): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

function monthEnd(month: string): string {
  const date = new Date(`${shiftMonth(month, 1)}-01T00:00:00Z`);
  date.setUTCDate(0);
  return date.toISOString().slice(0, 10);
}

export function monthlyRanges(month: string, today: string) {
  const previousMonth = shiftMonth(month, -1);
  const partial = month === today.slice(0, 7);
  const previousEnd = monthEnd(previousMonth);
  return {
    dateFrom: `${month}-01`,
    dateTo: partial ? today : monthEnd(month),
    previousFrom: `${previousMonth}-01`,
    previousTo: partial ? `${previousMonth}-${String(Math.min(Number(today.slice(8)), Number(previousEnd.slice(8)))).padStart(2, "0")}` : previousEnd,
    partial,
  };
}

export function monthlyQuery(dateFrom: string, dateTo: string, highlightFilter: MonthlyHighlightFilter = "ALL"): URLSearchParams {
  return new URLSearchParams({ dateFrom, dateTo, paymentMethod: "ALL", amountType: "ALL", highlightFilter });
}

/** A zero or negative baseline has no meaningful growth percentage. */
export function monthlyChange(current: number, previous: number) {
  return { difference: current - previous, percent: previous > 0 ? (current - previous) / previous * 100 : current === previous ? 0 : null };
}

export function monthlyComparisonPeriods(month: string, today: string) {
  const partial = month === today.slice(0, 7);
  return [0, -1, -2].map(offset => {
    const value = shiftMonth(month, offset);
    const end = monthEnd(value);
    return { month: value, dateFrom: `${value}-01`, dateTo: partial ? `${value}-${String(Math.min(Number(today.slice(8)), Number(end.slice(8)))).padStart(2, "0")}` : end };
  });
}

/** Server averages include the trailing calendar window; open or missing dates stay absent. */
export function monthlyAverageDays(data: FinanceAnalyticsResponse | null, dateFrom: string, dateTo: string) {
  const days = new Map(data?.days.map(day => [day.businessDate, day]));
  const month = dateFrom.slice(0, 7);
  return Array.from({ length: Number(dateTo.slice(8)) }, (_, index) => days.get(`${month}-${String(index + 1).padStart(2, "0")}`) ?? null);
}
