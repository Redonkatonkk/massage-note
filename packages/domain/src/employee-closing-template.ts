import { imageLocaleName, formatImageTime, type ImageLocale } from "./image-format.js";

export interface ClosingRecord {
  id?: string;
  startAt: string | null;
  endAt: string | null;
  status: string;
  serviceShortName: string;
  serviceName: string;
  addons: Array<{ shortName: string; name: string }>;
  isHighlighted?: boolean;
  discountTotalCents?: number;
  grossFeeBaseCents: number;
  cashServiceCents: number | null;
  cardServiceCents: number | null;
  giftCardServiceCents: number | null;
  cashTipCents: number | null;
  cardTipCents: number | null;
  giftCardTipCents: number | null;
  employeeIncomeCents: number | null;
}

export interface ClosingSnapshot {
  storeName: string;
  storeTimezone: string;
  businessDate: string;
  isClosed: boolean;
  activeClosing: null | { cycleNo: number };
  employee: {
    displayName: string;
    grossFeeBaseCents: number;
    cashToSubmitToStoreCents: number;
    cashLargeFeeDividendCents: number;
    cardLargeFeeDividendCents: number;
    cashTipDividendCents: number;
    cardTipDividendCents: number;
    confirmedLargeFeeWageCents: number;
    confirmedTipWageCents: number;
    confirmedIncomeCents: number;
  };
  records: ClosingRecord[];
}

export interface ClosingPaymentPart {
  method: "cash" | "card" | "gift" | "unknown" | "zero";
  text: string;
}

/** Presentation only: every earnings amount comes from the saved server snapshot. */
export function createEmployeeClosingTemplate(snapshot: ClosingSnapshot, locale: ImageLocale) {
  const en = locale === "en_US";
  const money = (cents: number) => new Intl.NumberFormat(imageLocaleName(locale), {
    style: "currency", currency: "USD", currencyDisplay: "narrowSymbol",
  }).format(cents / 100);
  const unknown = en ? "Unconfirmed" : "未确认";
  const paymentParts = (values: readonly [number | null, number | null, number | null], confirmed: boolean): ClosingPaymentPart[] => {
    if (!confirmed || values.every(value => value === null)) return [{ method: "unknown", text: unknown }];
    const methods = ["cash", "card", "gift"] as const;
    const labels = en ? ["Cash", "Card", "Gift card"] : ["现金", "刷卡", "礼卡"];
    const parts = values.flatMap((value, index) => value === 0 ? [] : [{ method: methods[index]!, text: `${labels[index]} ${value === null ? unknown : money(value)}` }]);
    return parts.length ? parts : [{ method: "zero", text: money(0) }];
  };
  const startTime = (record: ClosingRecord) => record.startAt === null ? Infinity : new Date(record.startAt).getTime();
  const records = snapshot.records.map((record, index) => ({ record, index })).sort((a, b) => {
    const difference = startTime(a.record) - startTime(b.record);
    return Number.isNaN(difference) || difference === 0 ? a.index - b.index : difference;
  }).map(({ record, index }) => {
    const confirmed = record.status === "CONFIRMED";
    return {
      key: record.id ?? String(index), title: record.serviceShortName || record.serviceName,
      time: `${formatImageTime(record.startAt, snapshot.storeTimezone, locale)}–${formatImageTime(record.endAt, snapshot.storeTimezone, locale)}`,
      addon: record.addons.length ? `${en ? "Add-on" : "加项"}：${record.addons.map(addon => addon.shortName || addon.name).join(" ＋ ")}` : "",
      highlighted: record.isHighlighted ?? false,
      discount: (record.discountTotalCents ?? 0) > 0 ? `off${new Intl.NumberFormat(imageLocaleName(locale), { maximumFractionDigits: 2 }).format(record.discountTotalCents! / 100)}` : "",
      pending: !confirmed,
      pendingText: en ? "Pending checkout · excluded from totals" : "待结账 · 未计入汇总",
      gross: money(record.grossFeeBaseCents),
      service: paymentParts([record.cashServiceCents, record.cardServiceCents, record.giftCardServiceCents], confirmed),
      tips: paymentParts([record.cashTipCents, record.cardTipCents, record.giftCardTipCents], confirmed),
      income: confirmed && record.employeeIncomeCents !== null ? money(record.employeeIncomeCents) : unknown,
    };
  });
  return {
    store: snapshot.storeName, employeeName: snapshot.employee.displayName,
    title: `${snapshot.employee.displayName} · ${en ? "Employee closing" : "个人日结"}`,
    date: new Intl.DateTimeFormat(imageLocaleName(locale), { year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "UTC" }).format(new Date(`${snapshot.businessDate}T12:00:00Z`)),
    state: snapshot.isClosed ? (en ? "Closed" : "已日结") : (en ? "Still open" : "尚未日结"),
    labels: {
      income: en ? "Today's confirmed earnings" : "今日已确认收入", currency: en ? "USD" : "美元",
      serviceWages: en ? "Service wages" : "大费工资", tips: en ? "Tips" : "小费", source: en ? "Source" : "来源",
      records: en ? "Today's work records" : "今日记工", count: en ? `${records.length} records` : `${records.length} 笔`,
      gross: en ? "Service" : "大费", received: en ? "Paid" : "实收", recordIncome: en ? "Earnings" : "本笔收入",
      empty: en ? "No work records for this business day" : "这个营业日还没有记工。",
      legend: en ? "Cash plain · Card outlined · Gift card labelled" : "现金无框 · 刷卡加框 · 礼卡带文字",
      footer: en ? "Earnings statement · Check settlement records for payments" : "收入明细 · 工资发放以结算记录为准",
    },
    income: money(snapshot.employee.confirmedIncomeCents),
    serviceWages: money(snapshot.employee.confirmedLargeFeeWageCents), tips: money(snapshot.employee.confirmedTipWageCents),
    sources: [
      { label: en ? "Cash" : "现金", wages: money(snapshot.employee.cashLargeFeeDividendCents), tips: money(snapshot.employee.cashTipDividendCents) },
      { label: en ? "Card + gift card" : "刷卡＋礼卡", wages: money(snapshot.employee.cardLargeFeeDividendCents), tips: money(snapshot.employee.cardTipDividendCents) },
    ], records,
  };
}

export type EmployeeClosingTemplate = ReturnType<typeof createEmployeeClosingTemplate>;
