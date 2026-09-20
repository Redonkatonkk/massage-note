import { z } from "zod";
import { businessDateSchema } from "./common.js";

export const financeAnalyticsQuerySchema = z.object({
  dateFrom: businessDateSchema.optional(),
  dateTo: businessDateSchema.optional(),
}).strict().refine(value => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, {
  path: ["dateTo"], message: "结束日期不能早于开始日期",
});
export type FinanceAnalyticsQuery = z.infer<typeof financeAnalyticsQuerySchema>;
export interface FinanceAnalyticsResponse {
  dateFrom: string;
  dateTo: string;
  hasData: boolean;
  hours: { hour: number; count: number }[];
  days: { businessDate: string; count: number; revenueCents: string | null; averageCents: string | null; averageDayCount: number }[];
  weekdays: { weekday: number; closedDayCount: number; calendarDayCount: number; averageCents: string | null; hours: number[] }[];
}
