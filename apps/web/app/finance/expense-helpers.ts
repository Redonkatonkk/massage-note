import { expensePeriodStart, type ExpenseRule } from "@massage-note/domain";

export function expenseInputCents(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value.trim())) throw new Error("请输入非负金额，最多两位小数 / Enter a non-negative amount with at most two decimals");
  const [whole, decimal = ""] = value.trim().split(".");
  const cents = BigInt(whole!) * 100n + BigInt(decimal.padEnd(2, "0"));
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("金额超出允许范围 / Amount exceeds the allowed range");
  return Number(cents);
}
export function expenseInputAmount(cents: string): string {
  const amount = BigInt(cents);
  return `${amount / 100n}.${(amount % 100n).toString().padStart(2, "0")}`;
}
export function expenseMoney(cents: string, locale: "zh-CN" | "en-US"): string {
  const amount = BigInt(cents), fraction = (amount % 100n).toString().padStart(2, "0");
  return new Intl.NumberFormat(locale, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).formatToParts(amount / 100n).map(part => part.type === "fraction" ? fraction : part.value).join("");
}
export function nextExpenseStart(rule: ExpenseRule, today: string): string {
  const distance = rule.unit === "MONTH"
    ? (Number(today.slice(0, 4)) - Number(rule.startDate.slice(0, 4))) * 12 + Number(today.slice(5, 7)) - Number(rule.startDate.slice(5, 7)) + (today.endsWith("-01") ? 0 : 1)
    : Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${rule.startDate}T00:00:00Z`)) / 86400000);
  const candidate = expensePeriodStart(rule, Math.max(1, Math.ceil(distance / rule.interval)));
  return rule.endExclusive && rule.endExclusive > candidate ? rule.endExclusive : candidate;
}
