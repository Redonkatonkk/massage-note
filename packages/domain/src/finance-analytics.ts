import { calculateAverageRevenue } from "./finance.js";

export function shiftAnalyticsDate(date: string, offset: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}
const weekday = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

/** Inputs are scoped to one store and exclude deleted records/sales. Dates are historical business dates. */
export function calculateFinanceAnalytics(input: {
  dateFrom: string; dateTo: string;
  records: { businessDate: string; startAt: Date; timezone: string; revenueCents: bigint }[];
  sales: { businessDate: string; revenueCents: bigint }[];
  closedDates: string[];
}) {
  const { dateFrom, dateTo } = input;
  const closed = new Set(input.closedDates);
  const revenue = new Map<string, bigint>();
  const counts = new Map<string, number>();
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  const weekdays = Array.from({ length: 7 }, (_, weekday) => ({ weekday, closedDayCount: 0, calendarDayCount: 0, averageCents: null as string | null, hours: Array<number>(24).fill(0) }));
  const formatters = new Map<string, Intl.DateTimeFormat>();
  for (const row of input.records) {
    revenue.set(row.businessDate, (revenue.get(row.businessDate) ?? 0n) + row.revenueCents);
    if (row.businessDate < dateFrom || row.businessDate > dateTo) continue;
    counts.set(row.businessDate, (counts.get(row.businessDate) ?? 0) + 1);
    let formatter = formatters.get(row.timezone);
    if (!formatter) {
      formatter = new Intl.DateTimeFormat("en-GB", { timeZone: row.timezone, hour: "2-digit", hourCycle: "h23" });
      formatters.set(row.timezone, formatter);
    }
    const hour = Number(formatter.format(row.startAt));
    hours[hour]!.count++;
    weekdays[weekday(row.businessDate)]!.hours[hour]!++;
  }
  for (const row of input.sales) revenue.set(row.businessDate, (revenue.get(row.businessDate) ?? 0n) + row.revenueCents);
  const weekdayAmounts = Array.from({ length: 7 }, () => [] as bigint[]);
  const days = [];
  for (let date = dateFrom; date <= dateTo; date = shiftAnalyticsDate(date, 1)) {
    const w = weekday(date);
    weekdays[w]!.calendarDayCount++;
    const amount = closed.has(date) ? revenue.get(date) ?? 0n : null;
    const window: bigint[] = [];
    if (amount !== null) {
      weekdayAmounts[w]!.push(amount);
      for (let offset = -6; offset <= 0; offset++) {
        const previous = shiftAnalyticsDate(date, offset);
        if (closed.has(previous)) window.push(revenue.get(previous) ?? 0n);
      }
    }
    days.push({ businessDate: date, count: counts.get(date) ?? 0, revenueCents: amount?.toString() ?? null,
      averageCents: calculateAverageRevenue(window)?.toString() ?? null, averageDayCount: window.length });
  }
  for (const row of weekdays) {
    row.closedDayCount = weekdayAmounts[row.weekday]!.length;
    row.averageCents = calculateAverageRevenue(weekdayAmounts[row.weekday]!)?.toString() ?? null;
  }
  const inRange = (date: string) => date >= dateFrom && date <= dateTo;
  return { dateFrom, dateTo, hasData: input.records.some(r => inRange(r.businessDate)) || input.sales.some(r => inRange(r.businessDate)) || input.closedDates.some(inRange), hours, days, weekdays };
}
