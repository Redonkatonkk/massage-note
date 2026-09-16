import { cents, multiplyByBps } from "./money.js";

/** A plain number is USD; a trailing percent sign is a discount rate. */
export function parseDiscountInput(value: string): { amountCents: number; rateBps: number | null } {
  const match = /^(\d+)(?:\.(\d{0,2}))?\s*([%％])?$/.exec(value.trim());
  if (!match) throw new Error("折扣请输入非负金额或 0–100% 的百分比，最多两位小数");
  const scaled = BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (scaled > BigInt(Number.MAX_SAFE_INTEGER) || (match[3] && scaled > 10_000n)) {
    throw new Error("折扣金额超出范围或百分比超过 100%");
  }
  return match[3]
    ? { amountCents: 0, rateBps: Number(scaled) }
    : { amountCents: Number(scaled), rateBps: null };
}

/** Rates apply to the combined main service and all add-ons, before any discounts. */
export function calculateDiscountAmount(grossCents: bigint, amountCents: bigint, rateBps?: number | null): bigint {
  return rateBps == null ? cents(amountCents) : multiplyByBps(grossCents, rateBps);
}
