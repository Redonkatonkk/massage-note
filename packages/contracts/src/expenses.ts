import { z } from "zod";
import { businessDateSchema, moneyCentsSchema, versionSchema } from "./common.js";

export const expenseMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const expenseRuleSchema = z.object({
  startDate: businessDateSchema,
  unit: z.enum(["DAY", "MONTH"]),
  interval: z.number().int().min(1).max(1200),
  amountMode: z.enum(["FIXED", "BUDGET"]),
  amountCents: moneyCentsSchema,
}).strict().superRefine((value, ctx) => {
  if (value.unit === "MONTH" && !value.startDate.endsWith("-01")) ctx.addIssue({ code: "custom", path: ["startDate"], message: "月周期必须从自然月第一天开始" });
});
const metadata = { name: z.string().trim().min(1).max(100), note: z.string().trim().max(2000).default("") };
export const createExpenseSchema = z.discriminatedUnion("kind", [
  z.object({ ...metadata, kind: z.literal("ONCE"), occurredOn: businessDateSchema, amountCents: moneyCentsSchema }).strict(),
  z.object({ ...metadata, kind: z.literal("RECURRING"), rule: expenseRuleSchema }).strict(),
]);
export const updateExpenseSchema = z.object({ version: versionSchema, name: metadata.name.optional(), note: metadata.note.optional(), occurredOn: businessDateSchema.optional(), amountCents: moneyCentsSchema.optional() }).strict();
export const expenseVersionSchema = z.object({ version: versionSchema }).strict();
export const reviseExpenseSchema = z.object({ version: versionSchema, rule: expenseRuleSchema }).strict();
export const stopExpenseSchema = z.object({ version: versionSchema, effectiveFrom: businessDateSchema }).strict();
export const expensePeriodSchema = z.object({ version: versionSchema, ruleId: z.uuid(), periodStart: businessDateSchema, amountCents: moneyCentsSchema }).strict();
export const clearExpensePeriodSchema = expensePeriodSchema.omit({ amountCents: true });
export const expenseQuerySchema = z.object({ month: expenseMonthSchema });
export type ExpenseRuleInput = z.infer<typeof expenseRuleSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ReviseExpenseInput = z.infer<typeof reviseExpenseSchema>;
export type StopExpenseInput = z.infer<typeof stopExpenseSchema>;
export type ExpensePeriodInput = z.infer<typeof expensePeriodSchema>;
export type ClearExpensePeriodInput = z.infer<typeof clearExpensePeriodSchema>;

export interface ExpenseRuleResponse extends Omit<ExpenseRuleInput, "amountCents"> {
  id: string; amountCents: string; endExclusive: string | null;
}
export interface ExpenseItemResponse {
  id: string; version: number; name: string; note: string; kind: "ONCE" | "RECURRING";
  occurredOn: string | null; amountCents: string | null; deletedAt: string | null;
  rules: ExpenseRuleResponse[];
}
export interface ExpenseMonthLine {
  itemId: string; ruleId: string | null; name: string; periodStart: string; periodEnd: string;
  source: "ACTUAL" | "FIXED" | "BUDGET"; periodAmountCents: string; allocatedCents: string;
  hasOverride: boolean;
}
export interface ExpenseMonthResponse {
  month: string; daysInMonth: number; totalCents: string; dailyAverageCents: string;
  budgetCents: string; lines: ExpenseMonthLine[]; items: ExpenseItemResponse[];
}
