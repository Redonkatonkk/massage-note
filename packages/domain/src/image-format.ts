export type ImageLocale = "zh_CN" | "en_US";

export const escapeImageXml = (value: unknown) => String(value).replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]!);
export const imageLocaleName = (locale: ImageLocale) => locale === "zh_CN" ? "zh-CN" : "en-US";
export const formatImageMoney = (cents: number | null, locale: ImageLocale) => cents === null ? "—" : new Intl.NumberFormat(imageLocaleName(locale), { style: "currency", currency: "USD" }).format(cents / 100);
export const formatImageTime = (value: string | null, timezone: string, locale: ImageLocale) => value ? new Intl.DateTimeFormat(imageLocaleName(locale), { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)) : "—";
