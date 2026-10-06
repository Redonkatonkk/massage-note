import { imageTheme as theme, imageTextUnits as textUnits, imageTextLines as textLines, imageLineHeight as lineHeightOf, imagePanel as panel, imageDivider as divider } from "./image-layout.js";
import { imageLocaleName as localeName, formatImageMoney as money, formatImageTime as time, type ImageLocale as Locale } from "./image-format.js";

interface ClosingRecord {
  startAt: string | null;
  endAt: string | null;
  status: string;
  serviceShortName: string;
  serviceName: string;
  addons: Array<{ shortName: string; name: string }>;
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

// At 390 CSS pixels, body text is 14–16px and auxiliary text is at least 12px.
// Keep Messages' original width and grow the height instead of shrinking text.
const WIDTH = 1170;
const MARGIN = 48;
const PADDING = 36;
const PANEL_WIDTH = WIDTH - MARGIN * 2;
const CONTENT_WIDTH = PANEL_WIDTH - PADDING * 2;
const CONTENT_X = MARGIN + PADDING;
const RIGHT_X = CONTENT_X + CONTENT_WIDTH;
const PANEL_GAP = 24;

type Flow = {
  text: (value: string, size: number, className: string, lineHeight: number, gap?: number) => void;
  amount: (label: string, value: string, className?: string) => void;
  rule: () => void;
};

function contentPanel(top: number, kind: string, draw: (flow: Flow) => void) {
  let cursor = top + PADDING;
  const content: string[] = [];
  const flow: Flow = {
    text(value, size, className, lineHeight, gap = 12) {
      content.push(textLines(value, CONTENT_WIDTH, size, CONTENT_X, cursor + size, className, lineHeight));
      cursor += lineHeightOf(value, CONTENT_WIDTH, size, lineHeight) + gap;
    },
    amount(label, value, className = "amount") {
      const labelSize = 44;
      const valueSize = 48;
      const amountWidth = textUnits(value) * valueSize + 4;
      const inline = textUnits(label) * labelSize + amountWidth + 24 <= CONTENT_WIDTH;
      if (inline) {
        content.push(textLines(label, CONTENT_WIDTH - amountWidth - 24, labelSize, CONTENT_X, cursor + valueSize, "amount-label", 56));
        content.push(textLines(value, amountWidth, valueSize, RIGHT_X, cursor + valueSize, className, 60, "end"));
        cursor += 60;
      } else {
        content.push(textLines(label, CONTENT_WIDTH, labelSize, CONTENT_X, cursor + labelSize, "amount-label", 56));
        cursor += lineHeightOf(label, CONTENT_WIDTH, labelSize, 56) + 10;
        content.push(textLines(value, CONTENT_WIDTH, valueSize, RIGHT_X, cursor + valueSize, className, 60, "end"));
        cursor += lineHeightOf(value, CONTENT_WIDTH, valueSize, 60);
      }
      cursor += 12;
    },
    rule() {
      cursor += 12;
      content.push(divider(CONTENT_X, cursor, CONTENT_WIDTH));
      cursor += 24;
    },
  };
  draw(flow);
  const height = cursor - top + PADDING;
  return { height, svg: panel(MARGIN, top, PANEL_WIDTH, height, kind) + content.join("") };
}

function paymentBreakdown(values: readonly [number | null, number | null, number | null], locale: Locale) {
  const en = locale === "en_US";
  if (values.every(value => value === null)) return en ? "Unconfirmed" : "未确认";
  const labels = en ? ["Cash", "Card", "Gift card"] : ["现金", "刷卡", "礼物卡"];
  const parts = values.flatMap((value, index) => value === 0 ? [] : [`${labels[index]} ${value === null ? (en ? "Unconfirmed" : "未确认") : money(value, locale)}`]);
  return parts.join(" · ") || money(0, locale);
}

function orderedRecords(records: readonly ClosingRecord[]) {
  const startTime = (record: ClosingRecord) => record.startAt === null ? Number.POSITIVE_INFINITY : new Date(record.startAt).getTime();
  return records.map((record, index) => ({ record, index })).sort((first, second) => {
    const difference = startTime(first.record) - startTime(second.record);
    return Number.isNaN(difference) || difference === 0 ? first.index - second.index : difference;
  }).map(({ record }) => record);
}

function recordPanel(record: ClosingRecord, index: number, top: number, snapshot: ClosingSnapshot, locale: Locale) {
  const en = locale === "en_US";
  const confirmed = record.status === "CONFIRMED";
  const incomeConfirmed = confirmed && record.employeeIncomeCents !== null;
  const name = [record.serviceShortName || record.serviceName, ...record.addons.map(addon => addon.shortName || addon.name)].join(" + ");
  return contentPanel(top, "record", flow => {
    flow.text(`${time(record.startAt, snapshot.storeTimezone, locale)}–${time(record.endAt, snapshot.storeTimezone, locale)} · ${en ? `Record ${index}` : `第 ${index} 笔`}`, 38, "record-meta", 48);
    flow.text(name, 48, "record-title", 60);
    flow.text(confirmed ? (en ? "Confirmed" : "已确认") : (en ? "Pending checkout · excluded from today's totals" : "待结账 · 未计入今日汇总"), 38, "record-meta", 48, 0);
    flow.rule();
    flow.amount(en ? (incomeConfirmed ? "Confirmed earnings for this record" : "Earnings awaiting confirmation") : (incomeConfirmed ? "本笔已确认收入" : "本笔收入（待确认）"), incomeConfirmed ? money(record.employeeIncomeCents, locale) : (en ? "Unconfirmed" : "未确认"), "amount record-income");
    flow.amount(en ? "Service price before discount" : "折前项目金额", money(record.grossFeeBaseCents, locale));
    flow.rule();
    flow.text(en ? "Customer service payment" : "客人支付的大费", 42, "payment-label", 54, 8);
    flow.text(paymentBreakdown([record.cashServiceCents, record.cardServiceCents, record.giftCardServiceCents], locale), 42, "payment-detail", 56, 20);
    flow.text(en ? "Customer tip payment" : "客人支付的小费", 42, "payment-label", 54, 8);
    flow.text(paymentBreakdown([record.cashTipCents, record.cardTipCents, record.giftCardTipCents], locale), 42, "payment-detail", 56, 0);
  });
}

/** A saved income snapshot, with no inference about whether wages were paid. */
export function createEmployeeClosingSvg(snapshot: ClosingSnapshot, locale: Locale) {
  const en = locale === "en_US";
  const content: string[] = [];
  let cursor = MARGIN;
  const addHeader = (value: string, size: number, className: string, lineHeight: number) => {
    content.push(textLines(value, PANEL_WIDTH, size, MARGIN, cursor + size, className, lineHeight));
    cursor += lineHeightOf(value, PANEL_WIDTH, size, lineHeight) + 12;
  };
  addHeader(snapshot.storeName, 42, "store", 54);
  addHeader(en ? "Employee closing · earnings statement" : "个人日结 · 收入明细", 42, "document-title", 54);
  const date = new Intl.DateTimeFormat(localeName(locale), { year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "UTC" }).format(new Date(`${snapshot.businessDate}T12:00:00Z`));
  addHeader(date, 42, "date", 54);
  addHeader(snapshot.employee.displayName, 60, "employee-name", 74);
  const closingState = snapshot.isClosed ? (en ? "Business day closed" : "已日结") : (en ? "Business day still open" : "尚未日结");
  addHeader(closingState + (snapshot.activeClosing ? (en ? ` · Closing #${snapshot.activeClosing.cycleNo}` : ` · 第 ${snapshot.activeClosing.cycleNo} 次日结`) : ""), 36, "closing-state", 46);
  cursor += 12;
  const appendPanel = (section: { height: number; svg: string }) => {
    content.push(section.svg);
    cursor += section.height + PANEL_GAP;
  };

  appendPanel(contentPanel(cursor, "income", flow => {
    flow.text(en ? "Today's confirmed earnings" : "今日已确认总收入", 44, "income-label", 56, 8);
    flow.text(money(snapshot.employee.confirmedIncomeCents, locale), 90, "primary-amount", 108, 16);
    flow.text(en ? "Confirmed service wages + tips. Check settlement records for payments." : "已确认大费工资＋小费；实际发放请核对结算记录。", 36, "note", 46, 0);
  }));
  appendPanel(contentPanel(cursor, "service-summary", flow => {
    flow.text(en ? "Service wages" : "大费工资", 48, "section-title", 60, 16);
    flow.amount(en ? "Cash" : "现金", money(snapshot.employee.cashLargeFeeDividendCents, locale));
    flow.amount(en ? "Non-cash (card + gift card)" : "非现金（刷卡＋礼物卡）", money(snapshot.employee.cardLargeFeeDividendCents, locale));
    flow.rule();
    flow.amount(en ? "Total service wages" : "大费工资合计", money(snapshot.employee.confirmedLargeFeeWageCents, locale), "amount subtotal");
    flow.text(en ? "Non-cash also includes service wages not allocated to cash." : "非现金还包含未按现金分配的项目工资。", 36, "note", 46, 0);
  }));
  appendPanel(contentPanel(cursor, "tip-summary", flow => {
    flow.text(en ? "Tips" : "小费", 48, "section-title", 60, 16);
    flow.amount(en ? "Cash" : "现金", money(snapshot.employee.cashTipDividendCents, locale));
    flow.amount(en ? "Non-cash (card + gift card)" : "非现金（刷卡＋礼物卡）", money(snapshot.employee.cardTipDividendCents, locale));
    flow.rule();
    flow.amount(en ? "Total tips" : "小费合计", money(snapshot.employee.confirmedTipWageCents, locale), "amount subtotal");
  }));

  addHeader(`${en ? "Work records" : "逐笔记工"} · ${snapshot.records.length} ${en ? "records" : "笔"}`, 48, "section-title", 60);
  const records = orderedRecords(snapshot.records);
  if (records.length === 0) appendPanel(contentPanel(cursor, "empty", flow => flow.text(en ? "No work records for this business day" : "本营业日暂无记工", 42, "empty-note", 56, 0)));
  else records.forEach((record, index) => appendPanel(recordPanel(record, index + 1, cursor, snapshot, locale)));
  addHeader(en ? "Massage Note · Saved business-day snapshot" : "Massage Note · 数据以系统保存的营业日快照为准", 36, "footer", 46);
  const height = Math.ceil(cursor + MARGIN);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}"><defs><style>text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;fill:${theme.ink};font-weight:400}.store,.document-title,.date{font-size:42px}.store,.date{fill:${theme.muted}}.employee-name{font-size:60px;font-weight:600}.closing-state,.note,.footer{font-size:36px;fill:${theme.muted}}.empty-note{font-size:42px;fill:${theme.muted}}.income-label,.amount-label{font-size:44px}.primary-amount{font-size:90px;font-weight:600;fill:${theme.brand};font-variant-numeric:tabular-nums lining-nums}.section-title,.record-title{font-size:48px;font-weight:600}.amount{font-size:48px;font-weight:500;font-variant-numeric:tabular-nums lining-nums}.subtotal,.record-income{font-weight:600}.record-meta{font-size:38px;fill:${theme.muted}}.payment-label{font-size:42px;font-weight:500}.payment-detail{font-size:42px;font-variant-numeric:tabular-nums lining-nums}</style></defs><rect x="0" y="0" width="${WIDTH}" height="${height}" fill="${theme.page}"/>${content.join("")}</svg>`;
  return { width: WIDTH, height, svg };
}
