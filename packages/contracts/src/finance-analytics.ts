import { z } from "zod";
import { businessDateSchema } from "./common.js";

export const financeAnalyticsQuerySchema = z.object({
  dateFrom: businessDateSchema.optional(),
  dateTo: businessDateSchema.optional(),
  highlightFilter: z.enum(["ALL", "ONLY_HIGHLIGHTED", "EXCLUDE_HIGHLIGHTED"]).optional(),
}).strict().refine(value => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, {
  path: ["dateTo"], message: "结束日期不能早于开始日期",
});
export type FinanceAnalyticsQuery = z.infer<typeof financeAnalyticsQuerySchema>;
export interface WeekdayRevenueComparison {
  hasData: boolean;
  days: { businessDate: string; highlightedRevenueCents: string | null; nonHighlightedRevenueCents: string | null; revenueCents: string | null }[];
  weekdays: { weekday: number; closedDayCount: number; highlightedAverageCents: string | null; nonHighlightedAverageCents: string | null; averageCents: string | null }[];
}
export interface FinanceTrendPeriod {
  dateFrom: string;
  dateTo: string;
  closedDayCount: number;
  /** Integer cents for money metrics; one-decimal records/day for records30. */
  value: string | null;
}
export interface FinanceTrendComparison {
  current: FinanceTrendPeriod;
  previous: FinanceTrendPeriod;
  /** Percentage in tenths: 125 means +12.5%. Computed before display rounding. */
  changeTenthsPercent: number | null;
  difference: string | null;
  direction: "UP" | "DOWN" | "FLAT" | null;
  status: "COMPARABLE" | "NO_SAMPLES" | "NO_BASELINE" | "NEW" | "ZERO_BASELINE" | "NEGATIVE_BASELINE";
}
export interface FinanceAnalyticsTrends {
  asOf: string;
  revenue7: FinanceTrendComparison;
  revenue30: FinanceTrendComparison;
  records30: FinanceTrendComparison;
  income30: FinanceTrendComparison;
}
export interface FinanceAnalyticsResponse {
  dateFrom: string;
  dateTo: string;
  hasData: boolean;
  trends: FinanceAnalyticsTrends | null;
  weekdayComparison: WeekdayRevenueComparison;
  hours: { hour: number; count: number }[];
  days: {
    businessDate: string; hours: number[]; count: number; lostCustomerCount: number; revenueCents: string | null;
    averageCents: string | null; averageDayCount: number;
    average30Cents: string | null; average30DayCount: number;
    cumulativeAverageCents: string | null; cumulativeAverageDayCount: number;
  }[];
  weekdays: { weekday: number; closedDayCount: number; calendarDayCount: number; averageCents: string | null; hours: number[] }[];
}
