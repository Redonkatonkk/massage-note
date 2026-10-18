import { calculateAverageRevenue } from "./finance.js";
import { roundSignedHalfUp } from "./money.js";

export function shiftAnalyticsDate(date: string, offset: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + offset);
  return value.toISOString().slice(0, 10);
}
const weekday = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;

/** Compare all three scopes over the same closed dates, independently of the page filter. */
export function calculateWeekdayRevenueComparison(input: {
  dateFrom: string; dateTo: string;
  records: { businessDate: string; revenueCents: bigint; isHighlighted: boolean }[];
  sales: { businessDate: string; revenueCents: bigint }[];
  closedDates: string[];
}) {
  const closed = new Set(input.closedDates);
  const highlighted = new Map<string, bigint>(), nonHighlighted = new Map<string, bigint>();
  for (const record of input.records) {
    const amounts = record.isHighlighted ? highlighted : nonHighlighted;
    amounts.set(record.businessDate, (amounts.get(record.businessDate) ?? 0n) + record.revenueCents);
  }
  // Sales have no highlight flag; retain the existing non-highlighted/all revenue definition.
  for (const sale of input.sales) nonHighlighted.set(sale.businessDate, (nonHighlighted.get(sale.businessDate) ?? 0n) + sale.revenueCents);
  const totals = Array.from({ length: 7 }, (_, weekday) => ({ weekday, closedDayCount: 0, highlighted: 0n, nonHighlighted: 0n }));
  const days = [];
  for (let date = input.dateFrom; date <= input.dateTo; date = shiftAnalyticsDate(date, 1)) {
    const h = closed.has(date) ? highlighted.get(date) ?? 0n : null;
    const n = closed.has(date) ? nonHighlighted.get(date) ?? 0n : null;
    if (h !== null && n !== null) {
      const total = totals[weekday(date)]!;
      total.closedDayCount++; total.highlighted += h; total.nonHighlighted += n;
    }
    days.push({ businessDate: date, highlightedRevenueCents: h?.toString() ?? null, nonHighlightedRevenueCents: n?.toString() ?? null, revenueCents: h === null || n === null ? null : (h + n).toString() });
  }
  const inRange = (date: string) => date >= input.dateFrom && date <= input.dateTo;
  return { hasData: input.records.some(r => inRange(r.businessDate)) || input.sales.some(r => inRange(r.businessDate)) || input.closedDates.some(inRange), days,
    weekdays: totals.map(row => ({ weekday: row.weekday, closedDayCount: row.closedDayCount,
      highlightedAverageCents: row.closedDayCount ? roundSignedHalfUp(row.highlighted, BigInt(row.closedDayCount)).toString() : null,
      nonHighlightedAverageCents: row.closedDayCount ? roundSignedHalfUp(row.nonHighlighted, BigInt(row.closedDayCount)).toString() : null,
      averageCents: row.closedDayCount ? roundSignedHalfUp(row.highlighted + row.nonHighlighted, BigInt(row.closedDayCount)).toString() : null,
    })),
  };
}

/** Inputs are scoped to one store and exclude deleted records/sales. Dates are historical business dates. */
export function calculateFinanceAnalytics(input: {
  dateFrom: string; dateTo: string;
  records: { businessDate: string; startAt: Date; timezone: string; revenueCents: bigint }[];
  sales: { businessDate: string; revenueCents: bigint }[];
  lostCustomers?: { businessDate: string; customerCount?: number }[];
  closedDates: string[];
}) {
  const { dateFrom, dateTo } = input;
  const closed = new Set(input.closedDates);
  const revenue = new Map<string, bigint>();
  const counts = new Map<string, number>();
  const lostCustomerCounts = new Map<string, number>();
  const dailyHours = new Map<string, number[]>();
  const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  const weekdays = Array.from({ length: 7 }, (_, weekday) => ({ weekday, closedDayCount: 0, calendarDayCount: 0, averageCents: null as string | null, hours: Array<number>(24).fill(0) }));
  const formatters = new Map<string, Intl.DateTimeFormat>();
  for (const row of input.lostCustomers ?? []) {
    lostCustomerCounts.set(row.businessDate, (lostCustomerCounts.get(row.businessDate) ?? 0) + (row.customerCount ?? 1));
  }
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
    const dateHours = dailyHours.get(row.businessDate) ?? Array<number>(24).fill(0);
    dateHours[hour]!++;
    dailyHours.set(row.businessDate, dateHours);
    weekdays[weekday(row.businessDate)]!.hours[hour]!++;
  }
  for (const row of input.sales) revenue.set(row.businessDate, (revenue.get(row.businessDate) ?? 0n) + row.revenueCents);
  const weekdayAmounts = Array.from({ length: 7 }, () => [] as bigint[]);
  let cumulativeTotal = 0n, cumulativeDayCount = 0;
  const days = [];
  for (let date = dateFrom; date <= dateTo; date = shiftAnalyticsDate(date, 1)) {
    const w = weekday(date);
    weekdays[w]!.calendarDayCount++;
    const amount = closed.has(date) ? revenue.get(date) ?? 0n : null;
    const window: bigint[] = [], window30: bigint[] = [];
    if (amount !== null) {
      weekdayAmounts[w]!.push(amount);
      cumulativeTotal += amount;
      cumulativeDayCount++;
      for (let offset = -29; offset <= 0; offset++) {
        const previous = shiftAnalyticsDate(date, offset);
        if (closed.has(previous)) {
          const previousAmount = revenue.get(previous) ?? 0n;
          window30.push(previousAmount);
          if (offset >= -6) window.push(previousAmount);
        }
      }
    }
    const lostCustomerCount = lostCustomerCounts.get(date) ?? 0;
    days.push({ businessDate: date, hours: dailyHours.get(date) ?? Array<number>(24).fill(0), count: counts.get(date) ?? 0, lostCustomerCount, revenueCents: amount?.toString() ?? null,
      averageCents: calculateAverageRevenue(window)?.toString() ?? null, averageDayCount: window.length,
      average30Cents: calculateAverageRevenue(window30)?.toString() ?? null, average30DayCount: window30.length,
      cumulativeAverageCents: amount === null ? null : roundSignedHalfUp(cumulativeTotal, BigInt(cumulativeDayCount)).toString(),
      cumulativeAverageDayCount: amount === null ? 0 : cumulativeDayCount });
  }
  for (const row of weekdays) {
    row.closedDayCount = weekdayAmounts[row.weekday]!.length;
    row.averageCents = calculateAverageRevenue(weekdayAmounts[row.weekday]!)?.toString() ?? null;
  }
  const inRange = (date: string) => date >= dateFrom && date <= dateTo;
  return { dateFrom, dateTo, hasData: input.records.some(r => inRange(r.businessDate)) || input.sales.some(r => inRange(r.businessDate)) || input.lostCustomers?.some(r => inRange(r.businessDate)) === true || input.closedDates.some(inRange), hours, days, weekdays };
}
