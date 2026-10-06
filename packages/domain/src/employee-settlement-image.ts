import { imageTheme as theme, imageTextUnits as textUnits, imageTextLines as textLines, imageLineHeight as lineHeightOf, imagePanel as panel, imageDivider as divider } from "./image-layout.js";
import { escapeImageXml as escapeXml, imageLocaleName as localeName, formatImageMoney as money, formatImageTime as recordTime, type ImageLocale as Locale } from "./image-format.js";

type Scope = "CASH" | "NON_CASH" | "ALL";

interface SettlementRecord {
  businessDate: string; startAt: string; endAt: string | null;
  serviceName: string; serviceShortName: string; addons: Array<{ name: string; shortName: string }>;
  grossFeeBaseCents: number; cashServiceCents: number; cardServiceCents?: number; giftCardServiceCents?: number; nonCashServiceCents: number;
  cashLargeFeeWageCents: number; nonCashLargeFeeWageCents: number;
  cashTipCents: number; cardTipCents?: number; giftCardTipCents?: number; nonCashTipCents: number; cashIncomeCents: number; nonCashIncomeCents: number; totalIncomeCents: number;
}
export interface SettlementSnapshot {
  storeName: string; storeTimezone: string; dateFrom: string; dateTo: string; paymentScope: Scope;
  generatedAt: string;
  employee: { displayName: string };
  summary: {
    recordCount: number; cashLargeFeeWageCents: number; nonCashLargeFeeWageCents: number;
    cashTipCents: number; nonCashTipCents: number; cashIncomeCents: number; nonCashIncomeCents: number; totalIncomeCents: number;
  };
  records: SettlementRecord[];
}

const scopeLabel = (scope: Scope, locale: Locale) => locale === "en_US" ? ({ CASH: "Cash", NON_CASH: "Non-cash", ALL: "All" } as const)[scope] : ({ CASH: "现金", NON_CASH: "非现金", ALL: "全部" } as const)[scope];
const recordName = (record: SettlementRecord) => [record.serviceShortName || record.serviceName, ...record.addons.map((item) => item.shortName || item.name)].join(" + ");
const hasPaymentBreakdown = (record: SettlementRecord) => record.cardServiceCents !== undefined || record.giftCardServiceCents !== undefined || record.cardTipCents !== undefined || record.giftCardTipCents !== undefined;
const paymentParts = (record: SettlementRecord, kind: "service" | "tip", locale: Locale) => {
  const en = locale === "en_US";
  const values = kind === "service"
    ? [[en ? "Cash" : "现金", record.cashServiceCents], [en ? "Card" : "刷卡", record.cardServiceCents ?? 0], [en ? "Gift" : "礼卡", record.giftCardServiceCents ?? 0]] as const
    : [[en ? "Cash" : "现金", record.cashTipCents], [en ? "Card" : "刷卡", record.cardTipCents ?? 0], [en ? "Gift" : "礼卡", record.giftCardTipCents ?? 0]] as const;
  return values.filter(([, value]) => value > 0).map(([label, value]) => `${label} ${money(value, locale)}`).join(" / ") || money(0, locale);
};
const paymentNotice = (record: SettlementRecord, scope: Scope, locale: Locale) => {
  const hasCash = record.cashServiceCents > 0 || record.cashTipCents > 0;
  const hasNonCash = record.nonCashServiceCents > 0 || record.nonCashTipCents > 0;
  if (!hasCash || !hasNonCash) return "";
  if (locale === "en_US") return scope === "CASH" ? "Mixed · cash portion only" : scope === "NON_CASH" ? "Mixed · card + gift portion only" : "Mixed cash + non-cash";
  return scope === "CASH" ? "混合付款 · 仅计算现金部分" : scope === "NON_CASH" ? "混合付款 · 仅计算刷卡＋礼卡部分" : "现金＋非现金混合付款";
};

function documentSvg(width: number, height: number, content: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><style>text{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Hiragino Sans GB","Microsoft YaHei",sans-serif;fill:${theme.ink};font-weight:400}.eyebrow{font-size:28px;fill:${theme.muted}}.name{font-size:44px;font-weight:600}.meta,.document-title{font-size:24px;fill:${theme.muted}}.label{font-size:24px;font-weight:500}.value{font-size:34px;font-weight:600;font-variant-numeric:tabular-nums lining-nums}.day-title{font-size:28px;font-weight:600}.day-meta{font-size:22px;fill:${theme.muted}}.record-title{font-size:22px;font-weight:600}.record-meta{font-size:18px;fill:${theme.muted}}.record-detail{font-size:16px;fill:${theme.muted}}.record-label{font-size:16px;fill:${theme.muted}}.record-value{font-size:20px;font-weight:500;font-variant-numeric:tabular-nums lining-nums}.record-total{font-size:24px}.summary-main{font-size:40px;font-weight:600}.income-notice{font-size:16px;fill:${theme.muted}}.total{fill:${theme.brand};font-weight:600}.footer{font-size:22px;fill:${theme.muted}}</style></defs><rect width="${width}" height="${height}" fill="${theme.page}"/>${content}</svg>`;
}

const LONG_IMAGE_MAX_HEIGHT = 32_760;
const PAGE_MARGIN = 32;
const CARD_GAP = 16;
const ROW_GAP = 12;
const CARD_PADDING = 12;
const DAY_HEADER_HEIGHT = 76;
const DAY_BOTTOM_GAP = 16;
const FOOTER_HEIGHT = 48;

type DayGroup = { businessDate: string; records: SettlementRecord[] };
type Layout = { width: number; columns: number; cardWidth: number; height: number; headerHeight: number; dayHeights: number[] };
type Amount = readonly [label: string, cents: number];

function groupByDay(records: SettlementRecord[]) {
  const groups = new Map<string, SettlementRecord[]>();
  for (const record of records) {
    const day = groups.get(record.businessDate) ?? [];
    day.push(record);
    groups.set(record.businessDate, day);
  }
  return [...groups.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .map(([businessDate, dayRecords]) => ({
      businessDate,
      records: dayRecords.sort((first, second) => first.startAt.localeCompare(second.startAt)),
    }));
}

// Keep labels next to right-aligned amounts; large values move below their label.
// The same measurement drives card heights and drawing, including English labels.
function amountRow(label: string, cents: number, width: number, locale: Locale, total: boolean, x = 0, y = 0, emphasized = total, main = false) {
  const value = money(cents, locale);
  const valueSize = total ? (main ? 40 : 24) : 20;
  const inline = textUnits(label) * 16 + textUnits(value) * valueSize + 24 <= width;
  const labelHeight = lineHeightOf(label, width, 16, 20);
  const valueHeight = lineHeightOf(value, width, valueSize, valueSize + 4);
  const inset = total ? 8 : 0;
  const valueY = y + inset + (inline ? valueSize : labelHeight + valueSize + 4);
  const height = inset + (inline ? valueSize + 4 : labelHeight + valueHeight + 4);
  const svg = (total ? divider(x, y, width) : "")
    + textLines(label, width, 16, x, y + inset + (inline ? valueSize : 16), "record-label", 20)
    + textLines(value, width, valueSize, x + width, valueY, total ? `record-value record-total${emphasized ? " total" : ""}${main ? " summary-main" : ""}` : "record-value", valueSize + 4, "end");
  return { height, svg };
}

function amountRows(amounts: readonly Amount[], width: number, locale: Locale, x = 0, y = 0, totalLast = true, emphasizeTotal = totalLast, main = false) {
  let height = 0;
  const parts: string[] = [];
  amounts.forEach(([label, cents], index) => {
    const row = amountRow(label, cents, width, locale, totalLast && index === amounts.length - 1, x, y + height, emphasizeTotal, main);
    height += row.height;
    parts.push(row.svg);
  });
  return { height, svg: parts.join("") };
}

function summaryColumns(snapshot: SettlementSnapshot, locale: Locale): Array<{ title: string; amounts: Amount[] }> {
  const en = locale === "en_US";
  const s = snapshot.summary;
  if (snapshot.paymentScope === "ALL") {
    return [
      { title: en ? "Cash" : "现金", amounts: [[en ? "Service wage" : "大费工资", s.cashLargeFeeWageCents], [en ? "Tips" : "小费", s.cashTipCents], [en ? "Cash earnings" : "现金收入", s.cashIncomeCents]] },
      { title: en ? "Non-cash" : "非现金", amounts: [[en ? "Service wage" : "大费工资", s.nonCashLargeFeeWageCents], [en ? "Tips" : "小费", s.nonCashTipCents], [en ? "Non-cash earnings" : "非现金收入", s.nonCashIncomeCents]] },
      { title: en ? "All sources" : "全部来源", amounts: [[en ? "Service wage" : "大费工资", s.cashLargeFeeWageCents + s.nonCashLargeFeeWageCents], [en ? "Tips" : "小费", s.cashTipCents + s.nonCashTipCents], [en ? "Total earnings" : "区间总收入", s.totalIncomeCents]] },
    ];
  }
  const cash = snapshot.paymentScope === "CASH";
  return [
    { title: en ? (cash ? "Cash service wage" : "Non-cash service wage") : (cash ? "现金大费工资" : "非现金大费工资"), amounts: [["", cash ? s.cashLargeFeeWageCents : s.nonCashLargeFeeWageCents]] },
    { title: en ? (cash ? "Cash tips" : "Non-cash tips") : (cash ? "现金小费" : "非现金小费"), amounts: [["", cash ? s.cashTipCents : s.nonCashTipCents]] },
    { title: en ? (cash ? "Cash earnings" : "Non-cash earnings") : (cash ? "现金工资合计" : "非现金工资合计"), amounts: [["", cash ? s.cashIncomeCents : s.nonCashIncomeCents]] },
  ];
}

function summaryCards(snapshot: SettlementSnapshot, locale: Locale, width: number, y = 0) {
  const columns = summaryColumns(snapshot, locale);
  const columnWidth = (width - PAGE_MARGIN * 2 - CARD_GAP * 2) / 3;
  const contentWidth = columnWidth - CARD_PADDING * 2;
  const titlesHeight = Math.max(...columns.map(column => lineHeightOf(column.title, contentWidth, 24, 30)));
  const isAll = snapshot.paymentScope === "ALL";
  const amountsHeight = Math.max(...columns.map((column, index) => isAll
    ? amountRows(column.amounts, contentWidth, locale, 0, 0, true, index === 2, index === 2).height
    : lineHeightOf(money(column.amounts[0]![1], locale), contentWidth, index === 2 ? 40 : 34, index === 2 ? 46 : 40)));
  const height = CARD_PADDING * 2 + titlesHeight + 12 + amountsHeight;
  const parts: string[] = [];
  columns.forEach((column, index) => {
    const x = PAGE_MARGIN + (columnWidth + CARD_GAP) * index;
    parts.push(panel(x, y, columnWidth, height));
    parts.push(textLines(column.title, contentWidth, 24, x + CARD_PADDING, y + CARD_PADDING + 24, "label", 30));
    const amountY = y + CARD_PADDING + titlesHeight + 12;
    if (isAll) parts.push(amountRows(column.amounts, contentWidth, locale, x + CARD_PADDING, amountY, true, index === 2, index === 2).svg);
    else parts.push(textLines(money(column.amounts[0]![1], locale), contentWidth, index === 2 ? 40 : 34, x + CARD_PADDING, amountY + (index === 2 ? 40 : 34), index === 2 ? "value total summary-main" : "value", index === 2 ? 46 : 40));
  });
  return { height, svg: parts.join("") };
}

function headerLayout(snapshot: SettlementSnapshot, locale: Locale, width: number, days: number) {
  const en = locale === "en_US";
  const contentWidth = width - PAGE_MARGIN * 2;
  const parts: string[] = [];
  let cursor = PAGE_MARGIN;
  const fields = [
    [snapshot.storeName, 28, 36, "eyebrow"],
    [`${en ? "Employee settlement" : "员工区间结算"} · ${snapshot.dateFrom} - ${snapshot.dateTo}`, 24, 32, "meta"],
    [snapshot.employee.displayName, 44, 54, "name"],
    [`${en ? "Earnings source" : "工资来源"}: ${scopeLabel(snapshot.paymentScope, locale)} · ${snapshot.records.length} ${en ? "records" : "笔"} · ${days} ${en ? "days" : "天"}`, 24, 32, "meta"],
  ] as const;
  fields.forEach(([value, fontSize, lineHeight, className]) => {
    parts.push(textLines(value, contentWidth, fontSize, PAGE_MARGIN, cursor + fontSize, className, lineHeight));
    cursor += lineHeightOf(value, contentWidth, fontSize, lineHeight) + 8;
  });
  cursor += 8;
  const summary = summaryCards(snapshot, locale, width, cursor);
  parts.push(summary.svg);
  const notice = en
    ? "Confirmed earnings; non-cash includes wages not allocated to cash. Check payroll records for payments."
    : "已确认记工收入；非现金含刷卡、礼物卡及未按现金分配的工资。实际发放请核对工资账本。";
  const noticeY = cursor + summary.height + 8;
  parts.push(textLines(notice, contentWidth, 16, PAGE_MARGIN, noticeY + 16, "income-notice", 20));
  return { height: noticeY + lineHeightOf(notice, contentWidth, 16, 20) + 24, svg: parts.join("") };
}

function recordAmounts(record: SettlementRecord, scope: Scope, locale: Locale): Amount[] {
  const en = locale === "en_US";
  const cash = scope === "CASH";
  return scope === "ALL"
    ? [[en ? "Cash earnings" : "现金收入", record.cashIncomeCents], [en ? "Non-cash earnings" : "非现金收入", record.nonCashIncomeCents], [en ? "Record earnings" : "本笔总收入", record.totalIncomeCents]]
    : [[en ? "Service wage" : "大费工资", cash ? record.cashLargeFeeWageCents : record.nonCashLargeFeeWageCents], [en ? "Tips" : "小费", cash ? record.cashTipCents : record.nonCashTipCents], [en ? "Record earnings" : "本笔收入", cash ? record.cashIncomeCents : record.nonCashIncomeCents]];
}

function recordDetails(record: SettlementRecord, scope: Scope, locale: Locale) {
  const en = locale === "en_US";
  return [
    ...(hasPaymentBreakdown(record) ? [
      `${en ? "Fee paid" : "大费实收"}: ${paymentParts(record, "service", locale)}`,
      `${en ? "Tip paid" : "小费实收"}: ${paymentParts(record, "tip", locale)}`,
    ] : []),
    paymentNotice(record, scope, locale),
  ].filter(Boolean);
}

function recordMeta(record: SettlementRecord, index: number, timezone: string, locale: Locale) {
  return `${recordTime(record.startAt, timezone, locale)}–${recordTime(record.endAt, timezone, locale)} · ${locale === "en_US" ? `Record ${index}` : `第 ${index} 笔`}`;
}

function recordCardHeight(record: SettlementRecord, cardWidth: number, locale: Locale, scope: Scope, timezone: string, index: number) {
  const width = cardWidth - CARD_PADDING * 2;
  const titleHeight = lineHeightOf(recordName(record), width, 22, 26);
  const timeHeight = lineHeightOf(recordMeta(record, index, timezone, locale), width, 18, 22);
  const detailHeight = recordDetails(record, scope, locale).reduce((sum, value) => sum + lineHeightOf(value, width, 16, 18), 0);
  return CARD_PADDING * 2 + titleHeight + timeHeight + detailHeight + amountRows(recordAmounts(record, scope, locale), width, locale).height;
}

function daySummary(day: DayGroup, scope: Scope, locale: Locale) {
  const en = locale === "en_US";
  const cash = scope === "CASH";
  const totals = day.records.reduce((sum, record) => ({
    gross: sum.gross + record.grossFeeBaseCents,
    wage: sum.wage + (cash ? record.cashLargeFeeWageCents : record.nonCashLargeFeeWageCents),
    tips: sum.tips + (cash ? record.cashTipCents : record.nonCashTipCents),
    cash: sum.cash + record.cashIncomeCents, nonCash: sum.nonCash + record.nonCashIncomeCents, total: sum.total + record.totalIncomeCents,
  }), { gross: 0, wage: 0, tips: 0, cash: 0, nonCash: 0, total: 0 });
  const amounts: Amount[] = scope === "ALL"
    ? [[en ? "Fee base" : "大费基数", totals.gross], [en ? "Cash earnings" : "现金收入", totals.cash], [en ? "Non-cash earnings" : "非现金收入", totals.nonCash]]
    : [[en ? "Fee base" : "大费基数", totals.gross], [en ? "Service wage" : "大费工资", totals.wage], [en ? "Tips" : "小费", totals.tips]];
  return { amounts, total: scope === "ALL" ? totals.total : cash ? totals.cash : totals.nonCash,
    label: en ? (scope === "ALL" ? "Daily earnings" : cash ? "Cash earnings" : "Non-cash earnings") : (scope === "ALL" ? "当日总收入" : cash ? "现金工资合计" : "非现金工资合计") };
}

function daySummaryHeight(day: DayGroup, cardWidth: number, locale: Locale, scope: Scope) {
  const width = cardWidth - CARD_PADDING * 2;
  const summary = daySummary(day, scope, locale);
  return CARD_PADDING * 2 + 32 + lineHeightOf(summary.label, width, 16, 20) + lineHeightOf(money(summary.total, locale), width, 34, 40) + 12
    + amountRows(summary.amounts, width, locale, 0, 0, false).height;
}

function dayCards(day: DayGroup, cardWidth: number, locale: Locale, scope: Scope, timezone: string) {
  return [
    { kind: "summary" as const, height: daySummaryHeight(day, cardWidth, locale, scope) },
    ...day.records.map((record, index) => ({ kind: "record" as const, record, index: index + 1, height: recordCardHeight(record, cardWidth, locale, scope, timezone, index + 1) })),
  ];
}

function dayLayoutHeight(day: DayGroup, columns: number, cardWidth: number, locale: Locale, scope: Scope, timezone: string) {
  const cards = dayCards(day, cardWidth, locale, scope, timezone);
  let cardsHeight = 0;
  for (let index = 0; index < cards.length; index += columns) {
    cardsHeight += Math.max(...cards.slice(index, index + columns).map(card => card.height));
    if (index + columns < cards.length) cardsHeight += ROW_GAP;
  }
  return DAY_HEADER_HEIGHT + cardsHeight + DAY_BOTTOM_GAP;
}

function chooseLayout(days: DayGroup[], snapshot: SettlementSnapshot, locale: Locale): Layout {
  const candidates = [{ width: 1080, columns: 2 }, { width: 1440, columns: 3 }, { width: 1680, columns: 4 }];
  for (const candidate of candidates) {
    const cardWidth = (candidate.width - PAGE_MARGIN * 2 - CARD_GAP * (candidate.columns - 1)) / candidate.columns;
    const dayHeights = days.map((day) => dayLayoutHeight(day, candidate.columns, cardWidth, locale, snapshot.paymentScope, snapshot.storeTimezone));
    const headerHeight = headerLayout(snapshot, locale, candidate.width, days.length).height;
    const height = headerHeight + dayHeights.reduce((sum, value) => sum + value, 0) + FOOTER_HEIGHT;
    if (height <= LONG_IMAGE_MAX_HEIGHT) return { ...candidate, cardWidth, height, headerHeight, dayHeights };
  }
  throw new Error("Settlement has too many records for one readable Messages image; shorten the date range");
}

function renderRecordCard(record: SettlementRecord, index: number, x: number, y: number, width: number, height: number, snapshot: SettlementSnapshot, locale: Locale) {
  const contentWidth = width - CARD_PADDING * 2;
  let cursor = y + CARD_PADDING;
  const parts = [panel(x, y, width, height)];
  const time = recordMeta(record, index, snapshot.storeTimezone, locale);
  parts.push(textLines(time, contentWidth, 18, x + CARD_PADDING, cursor + 18, "record-meta", 22));
  cursor += lineHeightOf(time, contentWidth, 18, 22);
  const title = recordName(record);
  parts.push(textLines(title, contentWidth, 22, x + CARD_PADDING, cursor + 22, "record-title", 26));
  cursor += lineHeightOf(title, contentWidth, 22, 26);
  recordDetails(record, snapshot.paymentScope, locale).forEach(value => {
    parts.push(textLines(value, contentWidth, 16, x + CARD_PADDING, cursor + 16, "record-detail", 18));
    cursor += lineHeightOf(value, contentWidth, 16, 18);
  });
  const amounts = recordAmounts(record, snapshot.paymentScope, locale);
  const statsHeight = amountRows(amounts, contentWidth, locale).height;
  parts.push(amountRows(amounts, contentWidth, locale, x + CARD_PADDING, y + height - CARD_PADDING - statsHeight).svg);
  return parts.join("");
}

function renderDaySummary(day: DayGroup, x: number, y: number, width: number, height: number, locale: Locale, scope: Scope) {
  const en = locale === "en_US";
  const contentWidth = width - CARD_PADDING * 2;
  const summary = daySummary(day, scope, locale);
  const parts = [panel(x, y, width, height, "day-summary"),
    `<text x="${x + CARD_PADDING}" y="${y + CARD_PADDING + 22}" class="record-title">${en ? "Daily summary" : "当日总结"}</text>`,
    `<text x="${x + width - CARD_PADDING}" y="${y + CARD_PADDING + 22}" text-anchor="end" class="record-meta">${day.records.length} ${en ? "records" : "笔"}</text>`,
  ];
  const labelY = y + CARD_PADDING + 32;
  parts.push(textLines(summary.label, contentWidth, 16, x + CARD_PADDING, labelY + 16, "record-label", 20));
  const amountY = labelY + lineHeightOf(summary.label, contentWidth, 16, 20);
  parts.push(textLines(money(summary.total, locale), contentWidth, 34, x + CARD_PADDING, amountY + 34, "value total", 40));
  const statsHeight = amountRows(summary.amounts, contentWidth, locale, 0, 0, false).height;
  parts.push(amountRows(summary.amounts, contentWidth, locale, x + CARD_PADDING, y + height - CARD_PADDING - statsHeight, false).svg);
  return parts.join("");
}

function dayLabel(businessDate: string, locale: Locale) {
  const date = new Date(`${businessDate}T12:00:00Z`);
  return new Intl.DateTimeFormat(localeName(locale), { month: "long", day: "numeric", weekday: "long", timeZone: "UTC" }).format(date);
}

export function createEmployeeSettlementSvg(snapshot: SettlementSnapshot, locale: Locale) {
  const en = locale === "en_US";
  const days = groupByDay(snapshot.records);
  const layout = chooseLayout(days, snapshot, locale);
  const header = headerLayout(snapshot, locale, layout.width, days.length);
  const sections: string[] = [];
  let dayY = layout.headerHeight;
  days.forEach((day, dayIndex) => {
    sections.push(`<text x="${PAGE_MARGIN}" y="${dayY + 28}" class="day-title">${escapeXml(dayLabel(day.businessDate, locale))}</text><text x="${PAGE_MARGIN}" y="${dayY + 54}" class="day-meta">${escapeXml(`${day.businessDate} · ${day.records.length} ${en ? "records" : "笔记工"}`)}</text>${divider(PAGE_MARGIN, dayY + 64, layout.width - PAGE_MARGIN * 2)}`);
    const cards = dayCards(day, layout.cardWidth, locale, snapshot.paymentScope, snapshot.storeTimezone);
    let rowY = dayY + DAY_HEADER_HEIGHT;
    for (let index = 0; index < cards.length; index += layout.columns) {
      const row = cards.slice(index, index + layout.columns);
      const rowHeight = Math.max(...row.map((card) => card.height));
      row.forEach((card, columnIndex) => {
        const x = PAGE_MARGIN + columnIndex * (layout.cardWidth + CARD_GAP);
        if (card.kind === "record") sections.push(renderRecordCard(card.record, card.index, x, rowY, layout.cardWidth, rowHeight, snapshot, locale));
        if (card.kind === "summary") sections.push(renderDaySummary(day, x, rowY, layout.cardWidth, rowHeight, locale, snapshot.paymentScope));
      });
      rowY += rowHeight + (index + layout.columns < cards.length ? ROW_GAP : 0);
    }
    dayY += layout.dayHeights[dayIndex]!;
  });
  const footer = `<text x="${PAGE_MARGIN}" y="${layout.height - 16}" class="footer">${escapeXml(en ? "Generated from confirmed work records" : "根据已确认记工生成")}</text>`;
  return { width: layout.width, height: layout.height, svg: documentSvg(layout.width, layout.height, header.svg + sections.join("") + footer) };
}
