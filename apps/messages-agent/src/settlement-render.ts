import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { PDFDocument } from "pdf-lib";

const execFileAsync = promisify(execFile);
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
const compact = (value: string, length: number) => value.length > length ? `${value.slice(0, Math.max(1, length - 1))}…` : value;
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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffaf3"/><stop offset="1" stop-color="#f2d7cb"/></linearGradient><style>text{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;fill:#211d18}.eyebrow{font-size:21px;font-weight:750;fill:#8e3e2f}.name{font-size:48px;font-weight:850}.meta{font-size:19px;font-weight:650;fill:#6b635a}.label{font-size:17px;font-weight:750;fill:#756b62}.value{font-size:30px;font-weight:850}.white{fill:#fff}.table-head{font-size:12px;font-weight:800;fill:#6b635a}.table-value{font-size:12px;font-weight:650}.table-strong{font-size:12px;font-weight:800;fill:#8e3e2f}.table-notice{font-size:10px;font-weight:800;fill:#8e3e2f}.footer{font-size:11px;fill:#756b62}</style></defs><rect width="${width}" height="${height}" fill="url(#bg)"/>${content}</svg>`;
}

function summaryContent(snapshot: SettlementSnapshot, locale: Locale, width: number, tall: boolean) {
  const en = locale === "en_US";
  const s = snapshot.summary;
  const title = en ? "Employee settlement" : "员工区间结算";
  const note = en ? "The detailed work-record list is attached as a PDF." : "完整逐笔明细见随后发送的 PDF";
  const top = tall ? 84 : 58;
  const cardY = tall ? 310 : 250;
  const cardH = tall ? 340 : 300;
  const labels = snapshot.paymentScope === "CASH"
    ? [en ? "Cash service wage" : "现金大费工资", en ? "Cash tips" : "现金小费", en ? "Cash earnings" : "现金工资合计"]
    : snapshot.paymentScope === "NON_CASH"
      ? [en ? "Non-cash service wage" : "刷卡＋礼卡大费工资", en ? "Non-cash tips" : "刷卡＋礼卡小费", en ? "Non-cash earnings" : "非现金工资合计"]
      : [en ? "Cash earnings" : "现金收入", en ? "Non-cash earnings" : "刷卡＋礼卡收入", en ? "Total earnings" : "区间总收入"];
  const values = snapshot.paymentScope === "CASH"
    ? [s.cashLargeFeeWageCents, s.cashTipCents, s.cashIncomeCents]
    : snapshot.paymentScope === "NON_CASH"
      ? [s.nonCashLargeFeeWageCents, s.nonCashTipCents, s.nonCashIncomeCents]
      : [s.cashIncomeCents, s.nonCashIncomeCents, s.totalIncomeCents];
  const gap = 18;
  const cardW = (width - 90 * 2 - gap * 2) / 3;
  const cards = labels.map((label, index) => {
    const x = 90 + index * (cardW + gap);
    const total = index === 2;
    const whiteStyle = total ? ' style="fill:#fff"' : "";
    return `<rect x="${x}" y="${cardY}" width="${cardW}" height="${cardH}" rx="24" fill="${total ? "#8e3e2f" : "#fff"}" fill-opacity=".96"/><text x="${x + 24}" y="${cardY + 65}" class="label"${whiteStyle}>${escapeXml(label)}</text><text x="${x + 24}" y="${cardY + 145}" class="value"${whiteStyle}>${escapeXml(money(values[index]!, locale))}</text>${tall ? `<text x="${x + 24}" y="${cardY + 230}" class="meta"${whiteStyle}>${escapeXml(en ? `${s.recordCount} records` : `${s.recordCount} 笔记工`)}</text>` : ""}`;
  }).join("");
  return `<text x="90" y="${top}" class="eyebrow">${escapeXml(snapshot.storeName)} · ${escapeXml(title)}</text><text x="90" y="${top + 78}" class="name">${escapeXml(compact(snapshot.employee.displayName, 22))}</text><text x="90" y="${top + 126}" class="meta">${escapeXml(snapshot.dateFrom)} - ${escapeXml(snapshot.dateTo)} · ${escapeXml(scopeLabel(snapshot.paymentScope, locale))} · ${s.recordCount} ${en ? "records" : "笔"}</text>${cards}<rect x="90" y="${cardY + cardH + 35}" width="${width - 180}" height="72" rx="18" fill="#fff1de"/><text x="120" y="${cardY + cardH + 80}" class="label">${escapeXml(note)}</text>`;
}

async function svgToPng(svg: string, svgPath: string, pngPath: string) {
  await writeFile(svgPath, svg, "utf8");
  await execFileAsync("/usr/bin/sips", ["-s", "format", "png", svgPath, "--out", pngPath]);
}

async function svgToJpeg(svg: string, svgPath: string, jpegPath: string) {
  await writeFile(svgPath, svg, "utf8");
  await execFileAsync("/usr/bin/sips", ["-s", "format", "jpeg", "-s", "formatOptions", "40", svgPath, "--out", jpegPath]);
}

function detailPage(snapshot: SettlementSnapshot, locale: Locale, pageRecords: SettlementRecord[], page: number, pages: number) {
  const en = locale === "en_US";
  const detailed = pageRecords.some(hasPaymentBreakdown);
  const width = 900, height = 1273, left = 42, tableTop = 180, rowHeight = detailed ? 68 : 34;
  const all = snapshot.paymentScope === "ALL";
  const cash = snapshot.paymentScope === "CASH";
  const columns = all
    ? [{ label: en ? "Date / time" : "日期／时间", x: 48, anchor: "start" }, { label: en ? "Service" : "项目／加项", x: 180, anchor: "start" }, { label: en ? "Fee base" : "大费基数", x: 528, anchor: "end" }, { label: en ? "Cash" : "现金收入", x: 632, anchor: "end" }, { label: en ? "Non-cash" : "刷卡＋礼卡", x: 752, anchor: "end" }, { label: en ? "Total" : "总收入", x: 856, anchor: "end" }]
    : [{ label: en ? "Date / time" : "日期／时间", x: 48, anchor: "start" }, { label: en ? "Service" : "项目／加项", x: 180, anchor: "start" }, { label: en ? "Fee base" : "大费基数", x: 528, anchor: "end" }, { label: en ? "Wage" : "大费工资", x: 650, anchor: "end" }, { label: en ? "Tips" : "小费", x: 760, anchor: "end" }, { label: en ? "Income" : "本笔收入", x: 856, anchor: "end" }];
  const headings = columns.map((column) => `<text x="${column.x}" y="${tableTop + 31}" text-anchor="${column.anchor}" class="table-head">${escapeXml(column.label)}</text>`).join("");
  const rows = pageRecords.map((record, index) => {
    const y = tableTop + 47 + index * rowHeight;
    const nameLimit = all ? 28 : 24;
    const base = [`<text x="48" y="${y + 12}" class="table-value">${escapeXml(record.businessDate.slice(5))}</text>`, `<text x="48" y="${y + 27}" class="footer">${escapeXml(recordTime(record.startAt, snapshot.storeTimezone, locale))}-${escapeXml(recordTime(record.endAt, snapshot.storeTimezone, locale))}</text>`, `<text x="180" y="${y + (detailed ? 14 : 21)}" class="table-value">${escapeXml(compact(recordName(record), nameLimit))}</text>`];
    if (detailed && hasPaymentBreakdown(record)) {
      const serviceLabel = en ? "Fee" : "大费";
      const tipLabel = en ? "Tip" : "小费";
      base.push(`<text x="180" y="${y + 30}" class="footer">${escapeXml(compact(`${serviceLabel}: ${paymentParts(record, "service", locale)}`, 48))}</text>`);
      base.push(`<text x="180" y="${y + 44}" class="footer">${escapeXml(compact(`${tipLabel}: ${paymentParts(record, "tip", locale)}`, 48))}</text>`);
      const notice = paymentNotice(record, snapshot.paymentScope, locale);
      if (notice) base.push(`<text x="180" y="${y + 59}" class="table-notice">${escapeXml(compact(notice, 42))}</text>`);
    }
    const amounts = all
      ? [record.grossFeeBaseCents, record.cashIncomeCents, record.nonCashIncomeCents, record.totalIncomeCents]
      : [record.grossFeeBaseCents, cash ? record.cashLargeFeeWageCents : record.nonCashLargeFeeWageCents, cash ? record.cashTipCents : record.nonCashTipCents, cash ? record.cashIncomeCents : record.nonCashIncomeCents];
    amounts.forEach((amount, amountIndex) => base.push(`<text x="${columns[amountIndex + 2]!.x}" y="${y + (detailed ? 31 : 21)}" text-anchor="end" class="${amountIndex === amounts.length - 1 ? "table-strong" : "table-value"}">${escapeXml(money(amount, locale))}</text>`));
    return `<rect x="${left}" y="${y}" width="${width - left * 2}" height="${rowHeight - 2}" rx="7" fill="${index % 2 ? "#fffaf6" : "#fff"}"/>${base.join("")}`;
  }).join("");
  const header = `<text x="42" y="55" class="eyebrow">${escapeXml(snapshot.storeName)} · ${escapeXml(en ? "Settlement details" : "员工结算明细")}</text><text x="42" y="103" class="name" style="font-size:32px">${escapeXml(compact(snapshot.employee.displayName, 24))}</text><text x="42" y="137" class="meta">${escapeXml(snapshot.dateFrom)} - ${escapeXml(snapshot.dateTo)} · ${escapeXml(scopeLabel(snapshot.paymentScope, locale))}</text><rect x="42" y="${tableTop}" width="${width - 84}" height="42" rx="9" fill="#f3e6de"/>${headings}`;
  const footer = `<text x="42" y="1240" class="footer">Massage Note · ${en ? "Confirmed work records only" : "仅统计付款已确认记工"}</text><text x="858" y="1240" text-anchor="end" class="footer">${page} / ${pages}</text>`;
  return documentSvg(width, height, header + rows + footer);
}

export async function renderSettlementArtifacts(snapshot: SettlementSnapshot, locale: Locale, workDir: string, summaryPngPath: string, pdfPath: string) {
  const summarySvg = documentSvg(1170, 820, summaryContent(snapshot, locale, 1170, false));
  await svgToPng(summarySvg, join(workDir, "settlement-summary.svg"), summaryPngPath);

  const recordsPerPage = snapshot.records.some(hasPaymentBreakdown) ? 14 : 28;
  const detailPages = Math.max(1, Math.ceil(snapshot.records.length / recordsPerPage));
  const totalPages = detailPages + 1;
  const pageImagePaths: string[] = [];
  const coverSvg = documentSvg(900, 1273, summaryContent(snapshot, locale, 900, true) + `<text x="450" y="1195" text-anchor="middle" class="footer">1 / ${totalPages}</text>`);
  const coverImage = join(workDir, "settlement-page-001.jpg");
  await svgToJpeg(coverSvg, join(workDir, "settlement-page-001.svg"), coverImage);
  pageImagePaths.push(coverImage);
  for (let index = 0; index < detailPages; index += 1) {
    const page = index + 2;
    const stem = `settlement-page-${String(page).padStart(3, "0")}`;
    const rows = snapshot.records.slice(index * recordsPerPage, (index + 1) * recordsPerPage);
    const imagePath = join(workDir, `${stem}.jpg`);
    await svgToJpeg(detailPage(snapshot, locale, rows, page, totalPages), join(workDir, `${stem}.svg`), imagePath);
    pageImagePaths.push(imagePath);
  }
  const pdf = await PDFDocument.create();
  const generatedAt = new Date(snapshot.generatedAt);
  if (Number.isNaN(generatedAt.getTime())) throw new Error("Settlement snapshot generatedAt is invalid");
  pdf.setCreationDate(generatedAt);
  pdf.setModificationDate(generatedAt);
  pdf.setCreator("Massage Note");
  pdf.setProducer("Massage Note");
  for (const imagePath of pageImagePaths) {
    const image = await pdf.embedJpg(await import("node:fs/promises").then(({ readFile }) => readFile(imagePath)));
    const page = pdf.addPage([900, 1273]);
    page.drawImage(image, { x: 0, y: 0, width: 900, height: 1273 });
  }
  await writeFile(pdfPath, await pdf.save());
  return { pageCount: totalPages };
}
