/** Store operating expenses are independent of payroll, revenue and daily closings. */
export interface ExpenseRule {
  id: string; startDate: string; endExclusive: string | null;
  unit: "DAY" | "MONTH"; interval: number; amountMode: "FIXED" | "BUDGET"; amountCents: bigint;
}
export interface ExpenseItem {
  id: string; name: string; kind: "ONCE" | "RECURRING"; deleted: boolean;
  occurredOn: string | null; amountCents: bigint | null; rules: ExpenseRule[];
  overrides: { ruleId: string; periodStart: string; amountCents: bigint }[];
}
const DAY_MS = 86400000;
const date = (s: string) => new Date(`${s}T00:00:00.000Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
export function addExpenseDays(s: string, n: number): string { return iso(new Date(date(s).getTime() + n * DAY_MS)); }
export function addExpenseMonths(s: string, n: number): string { const d = date(s); d.setUTCMonth(d.getUTCMonth() + n); return iso(d); }
const dayDistance = (a: string, b: string) => Math.round((date(b).getTime() - date(a).getTime()) / DAY_MS);
const monthDistance = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
export function expensePeriodStart(rule: ExpenseRule, index: number): string {
  return rule.unit === "MONTH" ? addExpenseMonths(rule.startDate, rule.interval * index) : addExpenseDays(rule.startDate, rule.interval * index);
}
export function isExpenseBoundary(rule: ExpenseRule, value: string): boolean {
  const distance = rule.unit === "MONTH" ? monthDistance(rule.startDate, value) : dayDistance(rule.startDate, value);
  return value >= rule.startDate && (rule.unit !== "MONTH" || value.endsWith("-01")) && distance % rule.interval === 0;
}
/** Allocate the remainder to the earliest days/months, independent of the queried month. */
function share(amount: bigint, units: number, offset: number, count: number): bigint {
  const divisor = BigInt(units), remainder = Number(amount % divisor);
  return amount / divisor * BigInt(count) + BigInt(Math.max(0, Math.min(offset + count, remainder) - offset));
}
export function calculateExpenseMonth(month: string, items: ExpenseItem[]) {
  const start = `${month}-01`, end = addExpenseMonths(start, 1), daysInMonth = dayDistance(start, end);
  const lines: { itemId: string; ruleId: string | null; name: string; periodStart: string; periodEnd: string; source: "ACTUAL" | "FIXED" | "BUDGET"; periodAmountCents: string; allocatedCents: string; hasOverride: boolean }[] = [];
  let total = 0n, budget = 0n;
  const append = (item: ExpenseItem, ruleId: string | null, periodStart: string, periodEnd: string, source: "ACTUAL" | "FIXED" | "BUDGET", amount: bigint, allocated: bigint, hasOverride: boolean) => {
    total += allocated; if (source === "BUDGET") budget += allocated;
    lines.push({ itemId: item.id, ruleId, name: item.name, periodStart, periodEnd, source, periodAmountCents: amount.toString(), allocatedCents: allocated.toString(), hasOverride });
  };
  for (const item of items) {
    if (item.deleted) continue;
    if (item.kind === "ONCE") {
      if (item.occurredOn && item.occurredOn >= start && item.occurredOn < end) append(item, null, item.occurredOn, item.occurredOn, "ACTUAL", item.amountCents ?? 0n, item.amountCents ?? 0n, false);
      continue;
    }
    for (const rule of item.rules) {
      if (rule.startDate >= end) continue;
      const distance = rule.unit === "MONTH" ? monthDistance(rule.startDate, start) : dayDistance(rule.startDate, start);
      let index = Math.max(0, Math.floor(distance / rule.interval));
      const overrides = new Map(item.overrides.filter(o => o.ruleId === rule.id).map(o => [o.periodStart, o.amountCents]));
      for (;;) {
        const periodStart = expensePeriodStart(rule, index++);
        if (periodStart >= end || (rule.endExclusive && periodStart >= rule.endExclusive)) break;
        const next = rule.unit === "MONTH" ? addExpenseMonths(periodStart, rule.interval) : addExpenseDays(periodStart, rule.interval);
        if (next <= start) continue;
        const override = overrides.get(periodStart), amount = override ?? rule.amountCents;
        const source = override !== undefined ? "ACTUAL" : rule.amountMode;
        const overlapStart = periodStart > start ? periodStart : start, overlapEnd = next < end ? next : end;
        const allocated = rule.unit === "MONTH"
          ? share(amount, rule.interval, monthDistance(periodStart, start), 1)
          : share(amount, rule.interval, dayDistance(periodStart, overlapStart), dayDistance(overlapStart, overlapEnd));
        append(item, rule.id, periodStart, addExpenseDays(next, -1), source, amount, allocated, override !== undefined);
      }
    }
  }
  lines.sort((a, b) => a.periodStart.localeCompare(b.periodStart) || a.name.localeCompare(b.name) || a.itemId.localeCompare(b.itemId));
  return { month, daysInMonth, totalCents: total.toString(), dailyAverageCents: ((total + BigInt(Math.floor(daysInMonth / 2))) / BigInt(daysInMonth)).toString(), budgetCents: budget.toString(), lines };
}
