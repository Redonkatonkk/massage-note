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

function paymentAmounts(cashCents: number | null, cardCents: number | null, giftCardCents: number | null, locale: Locale, startX: number, baselineY: number) {
  const amounts = [
    { kind: "cash", cents: cashCents },
    { kind: "card", cents: cardCents },
    { kind: "gift", cents: giftCardCents },
  ].filter((item): item is { kind: "cash" | "card" | "gift"; cents: number } => item.cents !== null && item.cents !== 0);
  if (amounts.length === 0) return `<text x="${startX}" y="${baselineY}" class="payment-value">—</text>`;

  let x = startX;
  return amounts.map((item, index) => {
    const prefix = index === 0 ? "" : `<text x="${x}" y="${baselineY}" class="payment-plus">+</text>`;
    if (index > 0) x += 24;
    const value = compactAmount(item.cents, locale);
    if (item.kind === "card") {
      const width = Math.max(48, value.length * 14 + 24);
      const markup = `${prefix}<rect x="${x}" y="${baselineY - 27}" width="${width}" height="36" rx="8" class="card-amount-box"/><text x="${x + 12}" y="${baselineY}" class="payment-value">${escapeXml(value)}</text>`;
      x += width + 10;
      return markup;
    }
    const suffix = item.kind === "gift" ? (locale === "zh_CN" ? "（礼物卡）" : " (Gift card)") : "";
    const text = `${value}${suffix}`;
    const markup = `${prefix}<text x="${x}" y="${baselineY}" class="payment-value">${escapeXml(text)}</text>`;
    x += text.length * 14 + 10;
    return markup;
  }).join("");
}

function time(value: string | null, timezone: string, locale: Locale) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale === "zh_CN" ? "zh-CN" : "en-US", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value));
}

export async function renderClosingPng(snapshot: ClosingSnapshot, locale: Locale, svgPath: string, pngPath: string) {
  const en = locale === "en_US";
  const labels = en ? {
    title: "Employee closing", service: "Service wage", tips: "Tips", income: "Total earnings",
    base: "Service-fee base", submit: "Cash to submit", records: "Work records", confirmed: "Confirmed", pending: "Pending",
    cash: "Cash", card: "Card", total: "Total", employeeFee: "Employee service (pre-discount)", actualFee: "Service paid", tip: "Tip", recordIncome: "Earnings", footer: "Massage Note · Saved business-day snapshot",
  } : {
    title: "个人日结", service: "大费工资", tips: "小费工资", income: "今日总收入",
    base: "大费基数", submit: "应提交现金", records: "逐笔记工", confirmed: "已确认", pending: "待结账",
    cash: "现金", card: "刷卡", total: "合计", employeeFee: "员工大费（折前）", actualFee: "大费实收", tip: "小费", recordIncome: "本笔收入", footer: "Massage Note · 数据以系统保存的营业日快照为准",
  };
  const width = 1170;
  const recordHeight = 225;
  const height = 760 + Math.max(1, snapshot.records.length) * recordHeight;
  // English labels are substantially wider than their Chinese counterparts.
  // Keep the value column far enough to the right so the pre-discount label
  // never collides with its amount (especially in the Messages preview).
  const paymentStartX = en ? 430 : 245;
  const grossValueX = en ? 500 : 330;
  const rows = snapshot.records.map((record, index) => {
    const y = 650 + index * recordHeight;
    const name = [record.serviceShortName || record.serviceName, ...record.addons.map((item) => item.shortName || item.name)].join(" + ");
    const service = paymentAmounts(record.cashServiceCents, record.cardServiceCents, record.giftCardServiceCents, locale, paymentStartX, y + 145);
    const tips = paymentAmounts(record.cashTipCents, record.cardTipCents, record.giftCardTipCents, locale, paymentStartX, y + 183);
    return `<rect x="60" y="${y}" width="1050" height="205" rx="22" fill="#ffffff" fill-opacity=".92"/><text x="88" y="${y + 36}" class="record">${escapeXml(name)}</text><text x="88" y="${y + 66}" class="small">${escapeXml(time(record.startAt, snapshot.storeTimezone, locale))}–${escapeXml(time(record.endAt, snapshot.storeTimezone, locale))}</text><text x="840" y="${y + 36}" text-anchor="end" class="status">${record.status === "CONFIRMED" ? labels.confirmed : labels.pending}</text><line x1="870" y1="${y + 25}" x2="870" y2="${y + 180}" class="record-divider"/><text x="1080" y="${y + 82}" text-anchor="end" class="small">${escapeXml(labels.recordIncome)}</text><text x="1080" y="${y + 122}" text-anchor="end" class="amount">${escapeXml(money(record.employeeIncomeCents, locale))}</text><text x="88" y="${y + 105}" class="payment-label">${escapeXml(labels.employeeFee)}：</text><text x="${grossValueX}" y="${y + 105}" class="gross-value">${escapeXml(money(record.grossFeeBaseCents, locale))}</text><text x="88" y="${y + 145}" class="payment-label">${escapeXml(labels.actualFee)}：</text>${service}<text x="88" y="${y + 183}" class="payment-label">${escapeXml(labels.tip)}：</text>${tips}`;
  }).join("");
  const date = new Intl.DateTimeFormat(en ? "en-US" : "zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "long", timeZone: "UTC" }).format(new Date(`${snapshot.businessDate}T12:00:00Z`));
  // sips interprets percentage SVG dimensions as literal user units in some macOS
  // versions, leaving most of the PNG transparent. Messages then renders that
  // transparency as black in dark mode, so keep both the canvas and background
  // dimensions explicit.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffaf3"/><stop offset="1" stop-color="#f2d7cb"/></linearGradient><style>text{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;fill:#211d18}.eyebrow{font-size:29px;font-weight:700;fill:#8e3e2f}.name{font-size:62px;font-weight:800}.date{font-size:28px;fill:#6b635a}.label{font-size:24px;font-weight:700;fill:#756b62}.value{font-size:36px;font-weight:800}.white{fill:#fff}.summary-heading{font-size:18px;font-weight:700;fill:#8e8176}.summary-label{font-size:21px;font-weight:800;fill:#514a43}.summary-value{font-size:24px;font-weight:800}.summary-total{fill:#8e3e2f}.summary-rule{stroke:#eee4dd;stroke-width:2}.record{font-size:27px;font-weight:800}.status{font-size:20px;font-weight:700;fill:#176b45}.small{font-size:19px;fill:#756b62}.amount{font-size:27px;font-weight:800;fill:#8e3e2f}.payment-label{font-size:22px;font-weight:800;fill:#756b62}.gross-value{font-size:25px;font-weight:800;fill:#8e3e2f}.payment-value{font-size:22px;font-weight:750}.payment-plus{font-size:22px;font-weight:700;fill:#8e8176}.card-amount-box{fill:none;stroke:#8e3e2f;stroke-width:2}.record-divider{stroke:#eadfd7;stroke-width:2}.footer{font-size:20px;fill:#756b62}</style></defs><rect x="0" y="0" width="${width}" height="${height}" fill="url(#bg)"/><text x="60" y="70" class="eyebrow">${escapeXml(snapshot.storeName)} · ${escapeXml(labels.title)}</text><text x="60" y="150" class="name">${escapeXml(snapshot.employee.displayName)}</text><text x="60" y="198" class="date">${escapeXml(date)} · #${snapshot.activeClosing?.cycleNo ?? 1}</text><rect x="60" y="240" width="1050" height="180" rx="28" fill="#fff" fill-opacity=".92"/><text x="300" y="277" text-anchor="middle" class="summary-heading">${escapeXml(labels.cash)}</text><text x="455" y="277" text-anchor="middle" class="summary-heading">${escapeXml(labels.card)}</text><text x="620" y="277" text-anchor="middle" class="summary-heading">${escapeXml(labels.total)}</text><line x1="88" y1="337" x2="680" y2="337" class="summary-rule"/><text x="92" y="322" class="summary-label">${escapeXml(labels.service)}</text><text x="300" y="322" text-anchor="middle" class="summary-value">${escapeXml(compactAmount(snapshot.employee.cashLargeFeeDividendCents, locale))}</text><text x="455" y="322" text-anchor="middle" class="summary-value">${escapeXml(compactAmount(snapshot.employee.cardLargeFeeDividendCents, locale))}</text><text x="620" y="322" text-anchor="middle" class="summary-value summary-total">${escapeXml(compactAmount(snapshot.employee.confirmedLargeFeeWageCents, locale))}</text><text x="92" y="382" class="summary-label">${escapeXml(labels.tips)}</text><text x="300" y="382" text-anchor="middle" class="summary-value">${escapeXml(compactAmount(snapshot.employee.cashTipDividendCents, locale))}</text><text x="455" y="382" text-anchor="middle" class="summary-value">${escapeXml(compactAmount(snapshot.employee.cardTipDividendCents, locale))}</text><text x="620" y="382" text-anchor="middle" class="summary-value summary-total">${escapeXml(compactAmount(snapshot.employee.confirmedTipWageCents, locale))}</text><rect x="720" y="260" width="360" height="140" rx="22" fill="#8e3e2f"/><text x="752" y="305" class="label white">${escapeXml(labels.income)}</text><text x="752" y="365" class="value white">${escapeXml(money(snapshot.employee.confirmedIncomeCents, locale))}</text><rect x="60" y="445" width="1050" height="105" rx="22" fill="#fff1de"/><text x="92" y="485" class="label">${escapeXml(labels.base)}</text><text x="92" y="530" class="value">${escapeXml(money(snapshot.employee.grossFeeBaseCents, locale))}</text><text x="620" y="485" class="label">${escapeXml(labels.submit)}</text><text x="620" y="530" class="value">${escapeXml(money(snapshot.employee.cashToSubmitToStoreCents, locale))}</text><text x="60" y="610" class="eyebrow">${escapeXml(labels.records)} · ${snapshot.records.length}</text>${rows || `<text x="88" y="700" class="date">—</text>`}<text x="60" y="${height - 36}" class="footer">${escapeXml(labels.footer)}</text></svg>`;
  await writeFile(svgPath, svg, "utf8");
  await execFileAsync("/usr/bin/sips", ["-s", "format", "png", svgPath, "--out", pngPath]);
}
