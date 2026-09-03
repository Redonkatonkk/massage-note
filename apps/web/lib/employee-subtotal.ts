export function formatCommissionRate(
  commissionBps: number | null,
  locale: "zh-CN" | "en-US" = "zh-CN",
) {
  if (commissionBps === null) {
    return locale === "en-US" ? "Uses item/store rate" : "跟随项目/店铺";
  }
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(commissionBps / 100)}%`;
}
