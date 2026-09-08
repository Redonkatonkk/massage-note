import { formatUsdPrecise } from "./money";
import type { AiPreview } from "./types";

export function previewValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function previewTime(value: unknown, timezone: string): string {
  if (typeof value !== "string") return previewValue(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function previewPayment(value: unknown): string {
  if (!value || typeof value !== "object") return previewValue(value);
  const payment = value as Record<string, unknown>;
  const cents = (key: string) => typeof payment[key] === "number" ? payment[key] as number : 0;
  const result: string[] = [];
  const groups = [
    [["cashServiceCents", "现金大费"], ["cardServiceCents", "刷卡大费"], ["giftCardServiceCents", "礼物卡大费"]],
    [["cashTipCents", "现金小费"], ["cardTipCents", "刷卡小费"], ["giftCardTipCents", "礼物卡小费"]],
  ] as const;
  for (const [index, group] of groups.entries()) {
    const nonzero = group.filter(([key]) => cents(key) !== 0);
    if (nonzero.length === 0) result.push(`${index === 0 ? "大费" : "小费"} ${formatUsdPrecise(0, "en-US")}`);
    else for (const [key, label] of nonzero) result.push(`${label} ${formatUsdPrecise(cents(key), "en-US")}`);
  }
  return result.join("、");
}

export function previewItems(value: unknown): string {
  if (!Array.isArray(value)) return previewValue(value);
  if (value.length === 0) return "无";
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") return previewValue(entry);
    const item = entry as Record<string, unknown>;
    const amount = typeof item.amountCents === "number" ? ` ${formatUsdPrecise(item.amountCents, "en-US")}` : "";
    return `${String(item.name ?? item.shortName ?? "项目")}${amount}`;
  }).join("、");
}

export function aiPreviewRows(preview: AiPreview, timezone: string): Array<[string, unknown]> {
  const after = preview.after;
  const changed = (key: string) => after[key] !== undefined ? after[key] : preview.target[key];
  const rows: Array<[string, unknown]> = [
    ["员工", after.employee ?? preview.target.employeeDisplayName ?? (preview.target.employee as { displayName?: string } | undefined)?.displayName],
    ["项目", after.service ?? (preview.target.serviceSnapshot as { name?: string } | undefined)?.name],
    ["开始时间", previewTime(changed("startAt"), timezone)],
    ["结束时间", previewTime(changed("endAt"), timezone)],
    ["项目金额", typeof after.amountCents === "number" ? formatUsdPrecise(after.amountCents, "en-US") : undefined],
    ["额外项目", after.addons === undefined ? undefined : previewItems(after.addons)],
    ["折扣", after.discounts === undefined ? undefined : previewItems(after.discounts)],
    ["付款", after.payment === undefined ? undefined : previewPayment(after.payment)],
    ["备注", after.note],
    ["删除原因", after.reason],
  ];
  return rows.filter((row) => row[1] !== undefined);
}
