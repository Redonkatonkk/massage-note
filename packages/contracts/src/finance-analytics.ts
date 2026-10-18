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
export interface FinanceAnalyticsResponse {
  dateFrom: string;
  dateTo: string;
  hasData: boolean;
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
