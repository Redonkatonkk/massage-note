import type { FinanceSummaryResponse } from "../../lib/types";
import { shiftDate } from "./date-utils";

export type IncomePeriod = "DAY" | "WEEK" | "MONTH";
type IncomeDay = Pick<FinanceSummaryResponse["days"][number], "businessDate" | "dailyTurnoverCents" | "storeIncomeCents" | "totalIncomeCents">;

function periodStart(date: string, period: IncomePeriod): string {
  if (period === "MONTH") return `${date.slice(0, 7)}-01`;
  if (period === "WEEK") return shiftDate(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
  return date;
}

/** Sum server-calculated daily amounts; do not recreate financial formulas. */
export function groupIncomePeriods(days: readonly IncomeDay[], dateFrom: string, dateTo: string, period: IncomePeriod) {
  const groups = new Map<string, { label: string; from: string; to: string; turnoverCents: number; storeIncomeCents: number; totalIncomeCents: number }>();
  for (let date = dateFrom; date <= dateTo; date = shiftDate(date, 1)) {
    const key = periodStart(date, period);
    const group = groups.get(key);
    if (group) group.to = date;
    else groups.set(key, { label: period === "MONTH" ? key.slice(0, 7) : date, from: date, to: date, turnoverCents: 0, storeIncomeCents: 0, totalIncomeCents: 0 });
  }
  for (const day of days) {
    if (day.businessDate < dateFrom || day.businessDate > dateTo) continue;
    const group = groups.get(periodStart(day.businessDate, period))!;
    group.turnoverCents += day.dailyTurnoverCents;
    group.storeIncomeCents += day.storeIncomeCents;
    group.totalIncomeCents += day.totalIncomeCents;
  }
  return [...groups.values()];
}
