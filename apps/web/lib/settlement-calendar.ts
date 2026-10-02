export interface SettlementDateRange { dateFrom: string; dateTo: string; selectingEnd: boolean }

export function selectSettlementDate(range: SettlementDateRange, date: string): SettlementDateRange {
  if (!range.selectingEnd || date < range.dateFrom) return { dateFrom: date, dateTo: "", selectingEnd: true };
  return { dateFrom: range.dateFrom, dateTo: date, selectingEnd: false };
}

export function shiftSettlementMonth(month: string, delta: number): string {
  const first = new Date(`${month}-01T12:00:00.000Z`);
  first.setUTCMonth(first.getUTCMonth() + delta);
  return first.toISOString().slice(0, 7);
}

/** UTC date-only arithmetic avoids DST and device/store timezone shifts. */
export function settlementMonthDays(month: string): Array<string | null> {
  const first = new Date(`${month}-01T12:00:00.000Z`);
  const leading = (first.getUTCDay() + 6) % 7;
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  const length = last.getUTCDate();
  const days: Array<string | null> = Array.from({ length: leading }, () => null);
  for (let day = 1; day <= length; day++) days.push(`${month}-${String(day).padStart(2, "0")}`);
  while (days.length % 7 !== 0) days.push(null);
  return days;
}
