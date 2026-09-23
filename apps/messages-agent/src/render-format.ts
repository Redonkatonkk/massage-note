export type Locale = "zh_CN" | "en_US";

export const escapeXml = (value: unknown) => String(value).replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]!);
export const localeName = (locale: Locale) => locale === "zh_CN" ? "zh-CN" : "en-US";
export const money = (cents: number | null, locale: Locale) => cents === null ? "—" : new Intl.NumberFormat(localeName(locale), { style: "currency", currency: "USD" }).format(cents / 100);
export const time = (value: string | null, timezone: string, locale: Locale) => value ? new Intl.DateTimeFormat(localeName(locale), { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)) : "—";
