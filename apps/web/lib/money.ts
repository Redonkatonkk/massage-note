export type MoneyLocale = "zh-CN" | "en-US";

const usdFormatters: Record<MoneyLocale, Intl.NumberFormat> = {
  "zh-CN": new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }),
  "en-US": new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }),
};

/** 页面只读金额统一显示为四舍五入后的整美元，底层美分值不变。 */
export function formatUsd(cents: number, locale: MoneyLocale = "zh-CN"): string {
  return usdFormatters[locale].format(cents / 100);
}

/** 今日卡片等不带货币符号的位置使用整美元数字。 */
export function formatWholeDollarAmount(cents: number): string {
  const normalizedCents = Math.trunc(cents);
  const roundedDollars = Math.round(Math.abs(normalizedCents) / 100);
  const sign = normalizedCents < 0 && roundedDollars !== 0 ? "-" : "";
  return `${sign}${roundedDollars}`;
}

/** 编辑框去掉无意义的末尾零，同时保留已有的真实美分，避免编辑时改写原值。 */
export function formatMoneyInput(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toString();
}
