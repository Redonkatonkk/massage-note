import { Prisma } from "@massage-note/database";
import type { ExpenseItemResponse, ExpenseMonthResponse } from "@massage-note/contracts";
import { calculateExpenseMonth, type ExpenseRule } from "@massage-note/domain";

export const include = { rules: { orderBy: { startDate: "asc" as const }, include: { periods: true } } };
export type Item = Prisma.ExpenseItemGetPayload<{ include: typeof include }>;
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
export function ruleValue(rule: Item["rules"][number]): ExpenseRule {
  return { id: rule.id, startDate: dateOnly(rule.startDate), endExclusive: rule.endExclusive ? dateOnly(rule.endExclusive) : null, unit: rule.unit as ExpenseRule["unit"], interval: rule.interval, defaultAmountFrom: dateOnly(rule.defaultAmountFrom), amountCents: rule.amountCents };
}
export function dto(item: Item): ExpenseItemResponse {
  return { id: item.id, version: item.version, name: item.name, note: item.note, kind: item.kind as ExpenseItemResponse["kind"], occurredOn: item.occurredOn ? dateOnly(item.occurredOn) : null, amountCents: item.amountCents?.toString() ?? null, deletedAt: item.deletedAt?.toISOString() ?? null, rules: item.rules.map(r => ({ ...ruleValue(r), amountCents: r.amountCents.toString() })) };
}
/** Authorization belongs to the caller; never expose store costs to employee views. */
export async function readExpenseMonth(database: Pick<Prisma.TransactionClient, "expenseItem">, storeId: string, month: string): Promise<ExpenseMonthResponse> {
  const items = await database.expenseItem.findMany({ where: { storeId }, include, orderBy: [{ createdAt: "desc" }, { id: "asc" }] });
  const summary = calculateExpenseMonth(month, items.map(item => ({ id: item.id, name: item.name, kind: item.kind as "ONCE" | "RECURRING", deleted: item.deletedAt !== null, occurredOn: item.occurredOn ? dateOnly(item.occurredOn) : null, amountCents: item.amountCents, rules: item.rules.map(ruleValue), overrides: item.rules.flatMap(r => r.periods.map(p => ({ ruleId: r.id, periodStart: dateOnly(p.periodStart), amountCents: p.amountCents }))) })));
  return { ...summary, items: items.map(dto) };
}
