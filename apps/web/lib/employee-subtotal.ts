export function formatEffectiveCommissionRate(
  grossFeeBaseCents: number,
  totalLargeFeeWageCents: number,
  locale: "zh-CN" | "en-US" = "zh-CN",
) {
  if (grossFeeBaseCents === 0) return "—";
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  }).format((totalLargeFeeWageCents * 100) / grossFeeBaseCents)}%`;
}
