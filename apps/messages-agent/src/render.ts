import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type Locale = "zh_CN" | "en_US";

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

const escapeXml = (value: unknown) => String(value).replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]!);
const money = (cents: number | null, locale: Locale) => cents === null ? "—" : new Intl.NumberFormat(locale === "zh_CN" ? "zh-CN" : "en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const compactAmount = (cents: number, locale: Locale) => new Intl.NumberFormat(locale === "zh_CN" ? "zh-CN" : "en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100);

function paymentAmounts(cashCents: number | null, cardCents: number | null, giftCardCents: number | null, locale: Locale, startX: number, baselineY: number, maxWidth = 340) {
  const amounts = [
    { kind: "cash", cents: cashCents },
    { kind: "card", cents: cardCents },
    { kind: "gift", cents: giftCardCents },
  ].filter((item): item is { kind: "cash" | "card" | "gift"; cents: number } => item.cents !== null && item.cents !== 0);
  if (amounts.length === 0) return { markup: `<text x="${startX}" y="${baselineY}" class="payment-value">—</text>`, height: 38 };

  let x = startX;
  let y = baselineY;
  const markup = amounts.map((item, index) => {
    const value = compactAmount(item.cents, locale);
    const suffix = item.kind === "gift" ? (locale === "zh_CN" ? "（礼物卡）" : " (Gift card)") : "";
    const text = `${value}${suffix}`;
    const width = item.kind === "card" ? Math.max(48, value.length * 14 + 24) : Array.from(text).reduce((sum, char) => sum + (/[^\x00-\x7f]/.test(char) ? 22 : 14), 0);
    if (x > startX && x + width + 24 > startX + maxWidth) { x = startX; y += 42; }
    const prefix = index === 0 ? "" : `<text x="${x}" y="${y}" class="payment-plus">+</text>`;
    if (index > 0) x += 24;
    const valueMarkup = item.kind === "card"
      ? `<rect x="${x}" y="${y - 27}" width="${width}" height="36" rx="8" class="card-amount-box"/><text x="${x + 12}" y="${y}" class="payment-value">${escapeXml(value)}</text>`
      : `<text x="${x}" y="${y}" class="payment-value">${escapeXml(text)}</text>`;
    x += width + 10;
    return prefix + valueMarkup;
  }).join("");
  return { markup, height: y - baselineY + 38 };

}

function time(value: string | null, timezone: string, locale: Locale) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale === "zh_CN" ? "zh-CN" : "en-US", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
}

export async function renderClosingPng(snapshot: ClosingSnapshot, locale: Locale, svgPath: string, pngPath: string) {
  const en = locale === "en_US";
  const labels = en ? {
    title: "Employee closing", service: "Service wage", tips: "Tips", income: "Total earnings",
    records: "Work records", confirmed: "Confirmed", pending: "Pending",
    cash: "Cash", card: "Card", total: "Total", employeeFee: "Service (pre-discount)", actualFee: "Service paid", tip: "Tip", recordIncome: "Earnings", footer: "Massage Note · Saved business-day snapshot",
  } : {
    title: "个人日结", service: "大费工资", tips: "小费工资", income: "今日总收入",
    records: "逐笔记工", confirmed: "已确认", pending: "待结账",
    cash: "现金", card: "刷卡", total: "合计", employeeFee: "员工大费（折前）", actualFee: "大费实收", tip: "小费", recordIncome: "本笔收入", footer: "Massage Note · 数据以系统保存的营业日快照为准",
  };
  const width = 1170;
  let nextY = 490;
  const rows = snapshot.records.map((record) => {
    const y = nextY;
    const name = [record.serviceShortName || record.serviceName, ...record.addons.map((item) => item.shortName || item.name)].join(" + ");
    const names: string[] = [];
    let line = "";
    let lineWidth = 0;
    for (const char of name) {
      const charWidth = /[^\x00-\x7f]/.test(char) ? 27 : 17;
      if (line && lineWidth + charWidth > 465) { names.push(line); line = ""; lineWidth = 0; }
      line += char;
      lineWidth += charWidth;
    }
    if (line) names.push(line);
    const service = paymentAmounts(record.cashServiceCents, record.cardServiceCents, record.giftCardServiceCents, locale, 755, y + 42);
    const tipsY = y + 42 + service.height + 10;
    const tips = paymentAmounts(record.cashTipCents, record.cardTipCents, record.giftCardTipCents, locale, 755, tipsY);
    const detailY = y + 36 + (names.length - 1) * 34;
    const rowHeight = Math.max(detailY - y + 113, tipsY - y + tips.height);
    nextY += rowHeight + 14;
    return `<rect x="60" y="${y}" width="1050" height="${rowHeight}" rx="22" fill="#ffffff" fill-opacity=".92"/>${names.map((nameLine, index) => `<text x="88" y="${y + 36 + index * 34}" class="record">${escapeXml(nameLine)}</text>`).join("")}<text x="88" y="${detailY + 30}" class="small">${escapeXml(time(record.startAt, snapshot.storeTimezone, locale))}–${escapeXml(time(record.endAt, snapshot.storeTimezone, locale))} · ${record.status === "CONFIRMED" ? labels.confirmed : labels.pending}</text><text x="88" y="${detailY + 64}" class="payment-label">${escapeXml(labels.employeeFee)}</text><text x="550" y="${detailY + 64}" text-anchor="end" class="gross-value">${escapeXml(money(record.grossFeeBaseCents, locale))}</text><text x="88" y="${detailY + 96}" class="small">${escapeXml(labels.recordIncome)}</text><text x="550" y="${detailY + 96}" text-anchor="end" class="amount">${escapeXml(money(record.employeeIncomeCents, locale))}</text><line x1="580" y1="${y + 18}" x2="580" y2="${y + rowHeight - 18}" class="record-divider"/><text x="605" y="${y + 42}" class="payment-label">${escapeXml(labels.actualFee)}</text>${service.markup}<text x="605" y="${tipsY}" class="payment-label">${escapeXml(labels.tip)}</text>${tips.markup}`;
  }).join("");
  const height = Math.max(nextY, 540) + 66;
  const date = new Intl.DateTimeFormat(en ? "en-US" : "zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "UTC" }).format(new Date(`${snapshot.businessDate}T12:00:00Z`));
  // sips interprets percentage SVG dimensions as literal user units in some macOS
  // versions, leaving most of the PNG transparent. Messages then renders that
  // transparency as black in dark mode, so keep both the canvas and background
  // dimensions explicit.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffaf3"/><stop offset="1" stop-color="#f2d7cb"/></linearGradient><style>text{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;fill:#211d18}.eyebrow{font-size:29px;font-weight:700;fill:#8e3e2f}.name{font-size:62px;font-weight:800}.date{font-size:28px;fill:#6b635a}.label{font-size:24px;font-weight:700;fill:#756b62}.value{font-size:36px;font-weight:800}.income-label{fill:#72311f;font-size:28px;font-weight:800}.income-value{fill:#632719;font-size:48px;font-weight:900}.summary-heading{font-size:18px;font-weight:700;fill:#8e8176}.summary-label{font-size:21px;font-weight:800;fill:#514a43}.summary-value{font-size:24px;font-weight:800}.summary-total{fill:#8e3e2f}.summary-rule{stroke:#eee4dd;stroke-width:2}.record{font-size:27px;font-weight:800}.status{font-size:20px;font-weight:700;fill:#176b45}.small{font-size:19px;fill:#756b62}.amount{font-size:27px;font-weight:800;fill:#8e3e2f}.payment-label{font-size:22px;font-weight:800;fill:#756b62}.gross-value{font-size:25px;font-weight:800;fill:#8e3e2f}.payment-value{font-size:22px;font-weight:750}.payment-plus{font-size:22px;font-weight:700;fill:#8e8176}.card-amount-box{fill:none;stroke:#8e3e2f;stroke-width:2}.record-divider{stroke:#eadfd7;stroke-width:2}.footer{font-size:20px;fill:#756b62}</style></defs><rect x="0" y="0" width="${width}" height="${height}" fill="url(#bg)"/><text x="60" y="70" class="eyebrow">${escapeXml(snapshot.storeName)} · ${escapeXml(labels.title)}</text><text x="60" y="150" class="name">${escapeXml(snapshot.employee.displayName)}</text><text x="60" y="198" class="date">${escapeXml(date)}${snapshot.activeClosing ? ` · #${snapshot.activeClosing.cycleNo}` : ""}</text><rect x="60" y="240" width="1050" height="180" rx="28" fill="#fff" fill-opacity=".92"/><text x="300" y="277" text-anchor="middle" class="summary-heading">${escapeXml(labels.cash)}</text><text x="455" y="277" text-anchor="middle" class="summary-heading">${escapeXml(labels.card)}</text><text x="620" y="277" text-anchor="middle" class="summary-heading">${escapeXml(labels.total)}</text><line x1="88" y1="337" x2="680" y2="337" class="summary-rule"/><text x="92" y="322" class="summary-label">${escapeXml(labels.service)}</text><text x="300" y="322" text-anchor="middle" class="summary-value">${escapeXml(compactAmount(snapshot.employee.cashLargeFeeDividendCents, locale))}</text><text x="455" y="322" text-anchor="middle" class="summary-value">${escapeXml(compactAmount(snapshot.employee.cardLargeFeeDividendCents, locale))}</text><text x="620" y="322" text-anchor="middle" class="summary-value summary-total">${escapeXml(compactAmount(snapshot.employee.confirmedLargeFeeWageCents, locale))}</text><text x="92" y="382" class="summary-label">${escapeXml(labels.tips)}</text><text x="300" y="382" text-anchor="middle" class="summary-value">${escapeXml(compactAmount(snapshot.employee.cashTipDividendCents, locale))}</text><text x="455" y="382" text-anchor="middle" class="summary-value">${escapeXml(compactAmount(snapshot.employee.cardTipDividendCents, locale))}</text><text x="620" y="382" text-anchor="middle" class="summary-value summary-total">${escapeXml(compactAmount(snapshot.employee.confirmedTipWageCents, locale))}</text><rect x="720" y="260" width="360" height="140" rx="22" fill="#f8dfcc"/><text x="752" y="305" class="income-label">${escapeXml(labels.income)}</text><text x="752" y="365" class="income-value">${escapeXml(money(snapshot.employee.confirmedIncomeCents, locale))}</text><text x="60" y="463" class="eyebrow">${escapeXml(labels.records)} · ${snapshot.records.length}</text>${rows || `<text x="88" y="510" class="date">—</text>`}<text x="60" y="${height - 36}" class="footer">${escapeXml(labels.footer)}</text></svg>`;
  await writeFile(svgPath, svg, "utf8");
  await execFileAsync("/usr/bin/sips", ["-s", "format", "png", svgPath, "--out", pngPath]);
}
