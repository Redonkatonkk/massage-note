import { DomainError } from "./errors.js";
import { cents } from "./money.js";

/** Calendar-date arithmetic only: the input is already the store's business date. */
export function cashResetDate(businessDate: string, cycle: string, weekday: number, monthDay: number): string {
  const date = new Date(`${businessDate}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== businessDate) {
    throw new DomainError("INVALID_BUSINESS_DATE", "营业日期无效");
  }
  if (cycle === "WEEKLY" && Number.isInteger(weekday) && weekday >= 1 && weekday <= 7) {
    date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7 + 1 - weekday + 7) % 7);
    return date.toISOString().slice(0, 10);
  }
  if (cycle === "MONTHLY" && Number.isInteger(monthDay) && monthDay >= 1 && monthDay <= 31) {
    const resetInMonth = (year: number, month: number) => new Date(Date.UTC(year, month,
      Math.min(monthDay, new Date(Date.UTC(year, month + 1, 0)).getUTCDate())));
    let reset = resetInMonth(date.getUTCFullYear(), date.getUTCMonth());
    if (reset > date) reset = resetInMonth(date.getUTCFullYear(), date.getUTCMonth() - 1);
    return reset.toISOString().slice(0, 10);
  }
  throw new DomainError("INVALID_CASH_RESET", "现金重置周期或日期无效");
}

export function calculateCashBalance(resetAmountCents: bigint, dailyChanges: readonly bigint[]): bigint {
  return dailyChanges.reduce((balance, change) => balance + change, cents(resetAmountCents));
}
