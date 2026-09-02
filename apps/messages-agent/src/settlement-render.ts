import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

type Locale = "zh_CN" | "en_US";
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

const escapeXml = (value: unknown) => String(value).replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]!);
const localeName = (locale: Locale) => locale === "zh_CN" ? "zh-CN" : "en-US";
const money = (cents: number, locale: Locale) => new Intl.NumberFormat(localeName(locale), { style: "currency", currency: "USD" }).format(cents / 100);
const scopeLabel = (scope: Scope, locale: Locale) => locale === "en_US" ? ({ CASH: "Cash", NON_CASH: "Card + gift card", ALL: "All" } as const)[scope] : ({ CASH: "现金", NON_CASH: "刷卡＋礼物卡", ALL: "全部" } as const)[scope];
const recordName = (record: SettlementRecord) => [record.serviceShortName || record.serviceName, ...record.addons.map((item) => item.shortName || item.name)].join(" + ");
const recordTime = (value: string | null, timezone: string, locale: Locale) => value ? new Intl.DateTimeFormat(localeName(locale), { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)) : "—";
const hasPaymentBreakdown = (record: SettlementRecord) => record.cardServiceCents !== undefined || record.giftCardServiceCents !== undefined || record.cardTipCents !== undefined || record.giftCardTipCents !== undefined;
const paymentParts = (record: SettlementRecord, kind: "service" | "tip", locale: Locale) => {
  const en = locale === "en_US";
  const values = kind === "service"
    ? [[en ? "Cash" : "现金", record.cashServiceCents], [en ? "Card" : "刷卡", record.cardServiceCents ?? 0], [en ? "Gift" : "礼卡", record.giftCardServiceCents ?? 0]] as const
    : [[en ? "Cash" : "现金", record.cashTipCents], [en ? "Card" : "刷卡", record.cardTipCents ?? 0], [en ? "Gift" : "礼卡", record.giftCardTipCents ?? 0]] as const;
  return values.filter(([, value]) => value > 0).map(([label, value]) => `${label} ${money(value, locale)}`).join(" / ") || "—";
};
const paymentNotice = (record: SettlementRecord, scope: Scope, locale: Locale) => {
  const hasCash = record.cashServiceCents > 0 || record.cashTipCents > 0;
  const hasNonCash = record.nonCashServiceCents > 0 || record.nonCashTipCents > 0;
  if (!hasCash || !hasNonCash) return "";
  if (locale === "en_US") return scope === "CASH" ? "Mixed · cash portion only" : scope === "NON_CASH" ? "Mixed · card + gift portion only" : "Mixed cash + non-cash";
  return scope === "CASH" ? "混合付款 · 仅计算现金部分" : scope === "NON_CASH" ? "混合付款 · 仅计算刷卡＋礼卡部分" : "现金＋非现金混合付款";
};

function documentSvg(width: number, height: number, content: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffaf3"/><stop offset="1" stop-color="#f2d7cb"/></linearGradient><filter id="shadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#7a4432" flood-opacity=".12"/></filter><style>text{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;fill:#211d18}.eyebrow{font-size:25px;font-weight:750;fill:#8e3e2f}.name{font-size:54px;font-weight:850}.meta{font-size:23px;font-weight:650;fill:#6b635a}.label{font-size:20px;font-weight:750;fill:#756b62}.value{font-size:34px;font-weight:850}.day-title{font-size:25px;font-weight:850}.day-meta{font-size:18px;font-weight:750;fill:#8e3e2f}.record-title{font-size:21px;font-weight:820}.record-meta{font-size:17px;font-weight:680;fill:#756b62}.record-detail{font-size:16px;font-weight:650;fill:#5f574f}.record-label{font-size:15px;font-weight:750;fill:#756b62}.record-value{font-size:20px;font-weight:850}.footer{font-size:15px;fill:#756b62}</style></defs><rect width="${width}" height="${height}" fill="url(#bg)"/>${content}</svg>`;
}

function summaryCards(snapshot: SettlementSnapshot, locale: Locale, width: number, cardY: number) {
  const en = locale === "en_US";
  const s = snapshot.summary;
  const labels = snapshot.paymentScope === "CASH"
    ? [en ? "Cash service wage" : "现金大费工资", en ? "Cash tips" : "现金小费", en ? "Cash earnings" : "现金工资合计"]
    : snapshot.paymentScope === "NON_CASH"
      ? [en ? "Card service dividend" : "刷卡大费分红", en ? "Card tips" : "刷卡小费", en ? "Non-cash earnings" : "非现金工资合计"]
      : [en ? "Cash earnings" : "现金收入", en ? "Non-cash earnings" : "刷卡＋礼卡收入", en ? "Total earnings" : "区间总收入"];
  const values = snapshot.paymentScope === "CASH"
    ? [s.cashLargeFeeWageCents, s.cashTipCents, s.cashIncomeCents]
    : snapshot.paymentScope === "NON_CASH"
      ? [s.nonCashLargeFeeWageCents, s.nonCashTipCents, s.nonCashIncomeCents]
      : [s.cashIncomeCents, s.nonCashIncomeCents, s.totalIncomeCents];
  const left = 32;
  const gap = 16;
  const cardH = 104;
  const cardW = (width - left * 2 - gap * 2) / 3;
  return labels.map((label, index) => {
    const x = left + index * (cardW + gap);
    const total = index === 2;
    return `<rect x="${x}" y="${cardY}" width="${cardW}" height="${cardH}" rx="18" fill="${total ? "#8e3e2f" : "#fff"}" fill-opacity=".97" filter="url(#shadow)"/><text x="${x + 22}" y="${cardY + 34}" class="label" style="${total ? "fill:#fff" : ""}">${escapeXml(label)}</text><text x="${x + 22}" y="${cardY + 78}" class="value" style="${total ? "fill:#fff" : ""}">${escapeXml(money(values[index]!, locale))}</text>`;
  }).join("");
}

const LONG_IMAGE_MAX_HEIGHT = 32_760;
const LONG_IMAGE_MIN_WIDTH = 720;
const LONG_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

async function renderLongDetailsImage(svg: string, sourceWidth: number, sourceHeight: number, outputPath: string) {
  if (sourceHeight > LONG_IMAGE_MAX_HEIGHT) throw new Error("Settlement has too many records for one readable Messages image; shorten the date range");
  const attempts = sourceHeight > 20_000
    ? [{ width: Math.round(sourceWidth * .86), quality: 55 }, { width: Math.round(sourceWidth * .72), quality: 55 }, { width: 1080, quality: 52 }, { width: LONG_IMAGE_MIN_WIDTH, quality: 60 }]
    : [{ width: sourceWidth, quality: 84 }, { width: Math.round(sourceWidth * .9), quality: 76 }, { width: Math.round(sourceWidth * .8), quality: 68 }, { width: LONG_IMAGE_MIN_WIDTH, quality: 62 }];
  let smallest: Buffer | null = null;
  let finalWidth = sourceWidth;
  let finalHeight = 0;
  for (const { width, quality } of attempts.filter((attempt, index, values) => attempt.width <= sourceWidth && values.findIndex((candidate) => candidate.width === attempt.width) === index)) {
    const height = Math.round((sourceHeight * width) / sourceWidth);
    const image = await sharp(Buffer.from(svg), { density: 72, limitInputPixels: false })
      .resize({ width, height, fit: "fill" })
      .jpeg({ quality, chromaSubsampling: sourceHeight > 20_000 ? "4:2:0" : "4:4:4" })
      .toBuffer();
    smallest = image;
    finalWidth = width;
    finalHeight = height;
    if (image.length <= LONG_IMAGE_MAX_BYTES) {
      await writeFile(outputPath, image);
      return { width, height, byteLength: image.length };
    }
  }
  throw new Error(`Settlement long image is too large for Messages (${smallest?.length ?? 0} bytes at ${finalWidth}x${finalHeight}); shorten the date range`);
}

type DayGroup = { businessDate: string; records: SettlementRecord[] };
type Layout = { width: number; columns: number; cardWidth: number; height: number; dayHeights: number[] };

const PAGE_MARGIN = 32;
const CARD_GAP = 16;
const HEADER_HEIGHT = 286;
const DAY_HEADER_HEIGHT = 58;
const DAY_BOTTOM_GAP = 24;

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

function wrapText(value: string, maxUnits: number) {
  const tokens = value.match(/[\u3400-\u9fff]|[^\s\u3400-\u9fff]+|\s+/gu) ?? [value];
  const lines: string[] = [];
  let line = "";
  let units = 0;
  const unitOf = (character: string) => /[\u3400-\u9fff\uff00-\uffef]/u.test(character) ? 1 : .56;
  const pushLine = () => {
    if (line.trim()) lines.push(line.trim());
    line = "";
    units = 0;
  };
  for (const token of tokens) {
    const tokenUnits = [...token].reduce((sum, character) => sum + unitOf(character), 0);
    if (tokenUnits <= maxUnits) {
      if (units + tokenUnits > maxUnits && line.trim()) pushLine();
      line += token;
      units += tokenUnits;
      continue;
    }
    for (const character of token) {
      const characterUnits = unitOf(character);
      if (units + characterUnits > maxUnits && line.trim()) pushLine();
      line += character;
      units += characterUnits;
    }
  }
  pushLine();
  return lines.length ? lines : [""];
}

function textLines(lines: string[], x: number, y: number, className: string, lineHeight: number, extra = "") {
  return `<text x="${x}" y="${y}" class="${className}" ${extra}>${lines.map((line, index) => `<tspan x="${x}" dy="${index ? lineHeight : 0}">${escapeXml(line)}</tspan>`).join("")}</text>`;
}

function recordCardHeight(record: SettlementRecord, cardWidth: number, locale: Locale, scope: Scope) {
  const contentUnits = Math.max(18, (cardWidth - 40) / 18);
  const serviceLines = wrapText(recordName(record), contentUnits);
  const detailLines = hasPaymentBreakdown(record)
    ? [
        ...wrapText(`${locale === "en_US" ? "Fee" : "大费"}: ${paymentParts(record, "service", locale)}`, contentUnits),
        ...wrapText(`${locale === "en_US" ? "Tip" : "小费"}: ${paymentParts(record, "tip", locale)}`, contentUnits),
      ]
    : [];
  const noticeLines = wrapText(paymentNotice(record, scope, locale), contentUnits);
  return 112 + serviceLines.length * 25 + detailLines.length * 20 + (noticeLines[0] ? noticeLines.length * 20 : 0);
}

function summaryLeadingSpacerCount(recordCount: number, columns: number) {
  return (columns - 1 - (recordCount % columns) + columns) % columns;
}

function dayLayoutHeight(day: DayGroup, columns: number, cardWidth: number, locale: Locale, scope: Scope) {
  const heights = [
    ...day.records.map((record) => recordCardHeight(record, cardWidth, locale, scope)),
    ...Array.from({ length: summaryLeadingSpacerCount(day.records.length, columns) }, () => 0),
    190,
  ];
  let cardsHeight = 0;
  for (let index = 0; index < heights.length; index += columns) {
    cardsHeight += Math.max(...heights.slice(index, index + columns));
    if (index + columns < heights.length) cardsHeight += CARD_GAP;
  }
  return DAY_HEADER_HEIGHT + cardsHeight + DAY_BOTTOM_GAP;
}

function chooseLayout(days: DayGroup[], locale: Locale, scope: Scope): Layout {
  const candidates = [{ width: 1080, columns: 2 }, { width: 1440, columns: 3 }, { width: 1680, columns: 4 }];
  for (const candidate of candidates) {
    const cardWidth = (candidate.width - PAGE_MARGIN * 2 - CARD_GAP * (candidate.columns - 1)) / candidate.columns;
    const dayHeights = days.map((day) => dayLayoutHeight(day, candidate.columns, cardWidth, locale, scope));
    const height = HEADER_HEIGHT + dayHeights.reduce((sum, value) => sum + value, 0) + 26;
    if (height <= LONG_IMAGE_MAX_HEIGHT) return { ...candidate, cardWidth, height, dayHeights };
  }
  throw new Error("Settlement has too many records for one readable Messages image; shorten the date range");
}

function renderRecordCard(record: SettlementRecord, index: number, x: number, y: number, width: number, height: number, snapshot: SettlementSnapshot, locale: Locale) {
  const en = locale === "en_US";
  const contentUnits = Math.max(18, (width - 40) / 18);
  const serviceLines = wrapText(recordName(record), contentUnits);
  const feeLines = hasPaymentBreakdown(record) ? wrapText(`${en ? "Fee" : "大费"}: ${paymentParts(record, "service", locale)}`, contentUnits) : [];
  const tipLines = hasPaymentBreakdown(record) ? wrapText(`${en ? "Tip" : "小费"}: ${paymentParts(record, "tip", locale)}`, contentUnits) : [];
  const notice = paymentNotice(record, snapshot.paymentScope, locale);
  const noticeLines = notice ? wrapText(notice, contentUnits) : [];
  const cash = snapshot.paymentScope === "CASH";
  const amounts = snapshot.paymentScope === "ALL"
    ? [[en ? "Cash" : "现金收入", record.cashIncomeCents], [en ? "Non-cash" : "刷卡＋礼卡", record.nonCashIncomeCents], [en ? "Total" : "本笔总收入", record.totalIncomeCents]] as const
    : [[en ? (cash ? "Service wage" : "Service dividend") : (cash ? "大费工资" : "大费分红"), cash ? record.cashLargeFeeWageCents : record.nonCashLargeFeeWageCents], [en ? "Tips" : "小费", cash ? record.cashTipCents : record.nonCashTipCents], [en ? "Income" : "本笔收入", cash ? record.cashIncomeCents : record.nonCashIncomeCents]] as const;
  let cursorY = y + 36;
  const parts = [`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="20" fill="#fff" fill-opacity=".97" stroke="#eadbd0" stroke-width="2"/>`];
  parts.push(textLines(serviceLines, x + 20, cursorY, "record-title", 25));
  cursorY += serviceLines.length * 25 + 7;
  parts.push(`<text x="${x + 20}" y="${cursorY}" class="record-meta">${escapeXml(`${recordTime(record.startAt, snapshot.storeTimezone, locale)}–${recordTime(record.endAt, snapshot.storeTimezone, locale)} · ${en ? `Record ${index}` : `第 ${index} 笔`}`)}</text>`);
  cursorY += 27;
  if (feeLines.length) { parts.push(textLines(feeLines, x + 20, cursorY, "record-detail", 20)); cursorY += feeLines.length * 20; }
  if (tipLines.length) { parts.push(textLines(tipLines, x + 20, cursorY, "record-detail", 20)); cursorY += tipLines.length * 20; }
  if (noticeLines.length) { parts.push(textLines(noticeLines, x + 20, cursorY, "record-meta", 20, 'style="fill:#8e3e2f;font-weight:800"')); }
  const statY = y + height - 48;
  const statWidth = (width - 40) / 3;
  amounts.forEach(([label, amount], amountIndex) => {
    const statX = x + 20 + amountIndex * statWidth;
    const anchor = amountIndex === 0 ? "start" : amountIndex === 2 ? "end" : "middle";
    const valueX = amountIndex === 0 ? statX : amountIndex === 2 ? x + width - 20 : statX + statWidth / 2;
    parts.push(`<text x="${valueX}" y="${statY}" text-anchor="${anchor}" class="record-label">${escapeXml(label)}</text><text x="${valueX}" y="${statY + 27}" text-anchor="${anchor}" class="record-value"${amountIndex === 2 ? ' style="fill:#8e3e2f"' : ""}>${escapeXml(money(amount, locale))}</text>`);
  });
  return parts.join("");
}

function renderDaySummary(day: DayGroup, x: number, y: number, width: number, height: number, locale: Locale) {
  const en = locale === "en_US";
  const totals = day.records.reduce((sum, record) => ({ gross: sum.gross + record.grossFeeBaseCents, cash: sum.cash + record.cashIncomeCents, nonCash: sum.nonCash + record.nonCashIncomeCents, total: sum.total + record.totalIncomeCents }), { gross: 0, cash: 0, nonCash: 0, total: 0 });
  const third = (width - 40) / 3;
  const stats = [[en ? "Fee base" : "大费基数", totals.gross], [en ? "Cash" : "现金收入", totals.cash], [en ? "Non-cash" : "刷卡＋礼卡", totals.nonCash]] as const;
  const parts = [`<rect data-card-kind="day-summary" x="${x}" y="${y}" width="${width}" height="${height}" rx="20" fill="#8e3e2f"/>`, `<text x="${x + 20}" y="${y + 34}" class="record-title" style="fill:#fff">${escapeXml(en ? "Daily summary" : "当日总结")}</text>`, `<text x="${x + width - 20}" y="${y + 34}" text-anchor="end" class="record-meta" style="fill:#f5d8ce">${day.records.length} ${en ? "records" : "笔"}</text>`, `<text x="${x + 20}" y="${y + 76}" class="record-label" style="fill:#f5d8ce">${escapeXml(en ? "Daily earnings" : "当日总收入")}</text>`, `<text x="${x + 20}" y="${y + 110}" class="value" style="fill:#fff">${escapeXml(money(totals.total, locale))}</text>`];
  stats.forEach(([label, amount], index) => {
    const statX = x + 20 + index * third;
    const anchor = index === 0 ? "start" : index === 2 ? "end" : "middle";
    const valueX = index === 0 ? statX : index === 2 ? x + width - 20 : statX + third / 2;
    parts.push(`<text x="${valueX}" y="${y + height - 42}" text-anchor="${anchor}" class="record-label" style="fill:#f5d8ce">${escapeXml(label)}</text><text x="${valueX}" y="${y + height - 16}" text-anchor="${anchor}" class="record-value" style="fill:#fff">${escapeXml(money(amount, locale))}</text>`);
  });
  return parts.join("");
}

function dayLabel(businessDate: string, locale: Locale) {
  const date = new Date(`${businessDate}T12:00:00Z`);
  return new Intl.DateTimeFormat(localeName(locale), { month: "long", day: "numeric", weekday: "long", timeZone: "UTC" }).format(date);
}

function longDetailsImage(snapshot: SettlementSnapshot, locale: Locale) {
  const en = locale === "en_US";
  const days = groupByDay(snapshot.records);
  const layout = chooseLayout(days, locale, snapshot.paymentScope);
  const header = `<text x="${PAGE_MARGIN}" y="44" class="eyebrow">${escapeXml(snapshot.storeName)} · ${escapeXml(en ? "Employee settlement" : "员工区间结算")}</text><text x="${PAGE_MARGIN}" y="104" class="name">${escapeXml(snapshot.employee.displayName)}</text><text x="${PAGE_MARGIN}" y="142" class="meta">${escapeXml(snapshot.dateFrom)} - ${escapeXml(snapshot.dateTo)} · ${escapeXml(scopeLabel(snapshot.paymentScope, locale))} · ${snapshot.records.length} ${en ? "records" : "笔"} · ${days.length} ${en ? "days" : "天"}</text>${summaryCards(snapshot, locale, layout.width, 164)}`;
  const sections: string[] = [];
  let dayY = HEADER_HEIGHT;
  days.forEach((day, dayIndex) => {
    sections.push(`<text x="${PAGE_MARGIN}" y="${dayY + 31}" class="day-title">${escapeXml(dayLabel(day.businessDate, locale))}</text><text x="${layout.width - PAGE_MARGIN}" y="${dayY + 31}" text-anchor="end" class="day-meta">${escapeXml(`${day.businessDate} · ${day.records.length} ${en ? "records" : "笔记工"}`)}</text>`);
    const cards = [
      ...day.records.map((record, index) => ({ kind: "record" as const, record, index: index + 1, height: recordCardHeight(record, layout.cardWidth, locale, snapshot.paymentScope) })),
      ...Array.from({ length: summaryLeadingSpacerCount(day.records.length, layout.columns) }, () => ({ kind: "spacer" as const, height: 0 })),
      { kind: "summary" as const, height: 190 },
    ];
    let rowY = dayY + DAY_HEADER_HEIGHT;
    for (let index = 0; index < cards.length; index += layout.columns) {
      const row = cards.slice(index, index + layout.columns);
      const rowHeight = Math.max(...row.map((card) => card.height));
      row.forEach((card, columnIndex) => {
        const x = PAGE_MARGIN + columnIndex * (layout.cardWidth + CARD_GAP);
        if (card.kind === "record") sections.push(renderRecordCard(card.record, card.index, x, rowY, layout.cardWidth, rowHeight, snapshot, locale));
        if (card.kind === "summary") sections.push(renderDaySummary(day, x, rowY, layout.cardWidth, rowHeight, locale));
      });
      rowY += rowHeight + (index + layout.columns < cards.length ? CARD_GAP : 0);
    }
    dayY += layout.dayHeights[dayIndex]!;
  });
  const footer = `<text x="${PAGE_MARGIN}" y="${layout.height - 12}" class="footer">${escapeXml(en ? "Generated from confirmed work records" : "根据已确认记工生成")}</text>`;
  return { width: layout.width, height: layout.height, svg: documentSvg(layout.width, layout.height, header + sections.join("") + footer) };
}

export async function renderSettlementLongImage(snapshot: SettlementSnapshot, locale: Locale, workDir: string, detailsImagePath: string) {
  const longDetails = longDetailsImage(snapshot, locale);
  await writeFile(join(workDir, "settlement-details-long.svg"), longDetails.svg, "utf8");
  const longImage = await renderLongDetailsImage(longDetails.svg, longDetails.width, longDetails.height, detailsImagePath);
  return { longImage };
}
