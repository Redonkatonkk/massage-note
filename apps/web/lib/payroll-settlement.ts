export function payrollAmountCents(value: string): number {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value.trim())) throw new Error("金额格式不正确");
  const [dollars, fraction = ""] = value.trim().split(".");
  const amount = BigInt(dollars!) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("金额超出系统允许范围");
  return Number(amount);
}
