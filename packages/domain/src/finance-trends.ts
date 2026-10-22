import { calculateRevenue, calculateStoreIncome, calculateStoreSettlement } from "./finance.js";
import { shiftAnalyticsDate } from "./finance-analytics.js";
import { roundSignedHalfUp } from "./money.js";

type TrendRecord = {
  businessDate: string;
  role: string;
  isHighlighted: boolean;
  discountedFeePerformanceCents: bigint;
  totalLargeFeeWageCents: bigint;
  cardServiceCents: bigint | null;
  giftCardServiceCents: bigint | null;
  cashTipCents: bigint | null;
  cardTipCents: bigint | null;
  giftCardTipCents: bigint | null;
};
type TrendSale = { businessDate: string; amountCents: bigint; cashCents: bigint; cardCents: bigint };
type TrendInput = {
  dateTo: string;
  closedDates: readonly string[];
  records: readonly TrendRecord[];
  sales: readonly TrendSale[];
  highlightFilter?: "ALL" | "ONLY_HIGHLIGHTED" | "EXCLUDE_HIGHLIGHTED";
};
type Period = { dateFrom: string; dateTo: string; closedDayCount: number; revenueCents: bigint; recordCount: bigint; incomeCents: bigint };
type Fraction = { numerator: bigint; denominator: bigint };
type Status = "COMPARABLE" | "NO_SAMPLES" | "NO_BASELINE" | "NEW" | "ZERO_BASELINE" | "NEGATIVE_BASELINE";

function periodTotals(input: TrendInput, closed: ReadonlySet<string>, dateFrom: string, dateTo: string): Period {
  const inPeriod = (date: string) => date >= dateFrom && date <= dateTo && closed.has(date);
  const totals = { discountedFeePerformanceCents: 0n, totalTipCents: 0n, employeeIncomeCents: 0n, giftCardSalesAmountCents: 0n, giftCardRedemptionCents: 0n };
  let revenueCents = 0n, recordCount = 0n, ownerWorkerIncomeCents = 0n, managerWorkerIncomeCents = 0n;
  let nonHighlightedCardAmountCents = 0n, highlightedCardPaymentCount = 0;
  for (const record of input.records) {
    if (!inPeriod(record.businessDate)) continue;
    if (input.highlightFilter === "ONLY_HIGHLIGHTED" && !record.isHighlighted) continue;
    if (input.highlightFilter === "EXCLUDE_HIGHLIGHTED" && record.isHighlighted) continue;
    const tips = (record.cashTipCents ?? 0n) + (record.cardTipCents ?? 0n) + (record.giftCardTipCents ?? 0n);
    const employeeIncome = record.totalLargeFeeWageCents + tips;
    totals.discountedFeePerformanceCents += record.discountedFeePerformanceCents;
    totals.totalTipCents += tips;
    totals.employeeIncomeCents += employeeIncome;
    totals.giftCardRedemptionCents += (record.giftCardServiceCents ?? 0n) + (record.giftCardTipCents ?? 0n);
    if (record.role === "OWNER") ownerWorkerIncomeCents += employeeIncome;
    if (record.role === "MANAGER") managerWorkerIncomeCents += employeeIncome;
    revenueCents += calculateRevenue({ discountedFeePerformanceCents: record.discountedFeePerformanceCents, giftCardServiceCents: record.giftCardServiceCents ?? 0n, giftCardSalesAmountCents: 0n });
    recordCount++;
    const cardAmount = (record.cardServiceCents ?? 0n) + (record.cardTipCents ?? 0n);
    if (cardAmount !== 0n) {
      if (record.isHighlighted) highlightedCardPaymentCount++;
      else nonHighlightedCardAmountCents += cardAmount;
    }
  }
  if (input.highlightFilter !== "ONLY_HIGHLIGHTED") for (const sale of input.sales) {
    if (!inPeriod(sale.businessDate)) continue;
    revenueCents += sale.amountCents;
    totals.giftCardSalesAmountCents += sale.cashCents + sale.cardCents;
  }
  // Round card fees once over the entire period, exactly as Finance Summary does.
  const settlement = calculateStoreSettlement({
    ...totals, storeIncomeCents: calculateStoreIncome(totals), ownerWorkerIncomeCents, managerWorkerIncomeCents,
    nonHighlightedCardAmountCents, highlightedCardPaymentCount,
  });
  return { dateFrom, dateTo, closedDayCount: [...closed].filter(inPeriod).length, revenueCents, recordCount, incomeCents: settlement.totalIncomeCents };
}

function displayValue(numerator: bigint, denominator: bigint, count: boolean): string {
  const rounded = roundSignedHalfUp(numerator * (count ? 10n : 1n), denominator);
  if (!count) return rounded.toString();
  const digits = (rounded < 0n ? -rounded : rounded).toString().padStart(2, "0");
  return `${rounded < 0n ? "-" : ""}${digits.slice(0, -1)}.${digits.slice(-1)}`;
}

function comparison(current: Period, previous: Period, metric: "revenueCents" | "recordCount" | "incomeCents") {
  const count = metric === "recordCount";
  const fraction = (period: Period): Fraction | null => period.closedDayCount === 0 ? null
    : { numerator: period[metric], denominator: metric === "incomeCents" ? 1n : BigInt(period.closedDayCount) };
  const c = fraction(current), p = fraction(previous);
  const report = (period: Period, value: Fraction | null) => ({
    dateFrom: period.dateFrom, dateTo: period.dateTo, closedDayCount: period.closedDayCount,
    value: value ? displayValue(value.numerator, value.denominator, count) : null,
  });
  let status: Status = c === null ? "NO_SAMPLES" : p === null ? "NO_BASELINE" : "COMPARABLE";
  let changeTenthsPercent: number | null = null;
  let difference: string | null = null;
  let direction: "UP" | "DOWN" | "FLAT" | null = null;
  if (c && p) {
    const delta = c.numerator * p.denominator - p.numerator * c.denominator;
    difference = displayValue(delta, c.denominator * p.denominator, count);
    direction = delta > 0n ? "UP" : delta < 0n ? "DOWN" : "FLAT";
    if (p.numerator > 0n) changeTenthsPercent = Number(roundSignedHalfUp(delta * 1000n, c.denominator * p.numerator));
    else if (p.numerator < 0n) status = "NEGATIVE_BASELINE";
    else if (c.numerator > 0n) status = "NEW";
    else if (c.numerator < 0n) status = "ZERO_BASELINE";
    else changeTenthsPercent = 0;
  }
  return { current: report(current, c), previous: report(previous, p), changeTenthsPercent, difference, direction, status };
}

/** Inputs exclude deleted/placeholder records; every metric uses closed dates only. */
export function calculateFinanceTrends(input: TrendInput) {
  const closed = new Set(input.closedDates.filter(date => date <= input.dateTo));
  const asOf = [...closed].sort().at(-1);
  if (!asOf) return null;
  const current7 = periodTotals(input, closed, shiftAnalyticsDate(asOf, -6), asOf);
  const previous7 = periodTotals(input, closed, shiftAnalyticsDate(asOf, -13), shiftAnalyticsDate(asOf, -7));
  const current30 = periodTotals(input, closed, shiftAnalyticsDate(asOf, -29), asOf);
  const previous30 = periodTotals(input, closed, shiftAnalyticsDate(asOf, -59), shiftAnalyticsDate(asOf, -30));
  return { asOf, revenue7: comparison(current7, previous7, "revenueCents"), revenue30: comparison(current30, previous30, "revenueCents"), records30: comparison(current30, previous30, "recordCount"), income30: comparison(current30, previous30, "incomeCents") };
}
