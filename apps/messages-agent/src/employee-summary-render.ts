import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

type Locale = "zh_CN" | "en_US";

export interface EmployeeSummarySnapshot {
  documentType: "EMPLOYEE_SUMMARY";
  storeName: string;
  storeTimezone: string;
  dateFrom: string;
  dateTo: string;
  paymentMethod: "ALL" | "CASH" | "NON_CASH";
  amountType: "ALL" | "SERVICE" | "TIP";
  highlightFilter: "ALL" | "ONLY_HIGHLIGHTED" | "EXCLUDE_HIGHLIGHTED";
  employees: Array<{
    membershipId: string;
    displayName: string;
    role: "OWNER" | "MANAGER" | "EMPLOYEE";
    defaultCommissionBps?: number | null;
    hasDifferentItemCommission?: boolean;
    recordCount: number;
    mainServiceAmountCents: number;
    addonTotalCents: number;
    grossFeeBaseCents: number;
    totalTipCents: number;
    totalLargeFeeWageCents: number;
    employeeIncomeCents: number;
  }>;
  generatedAt: string;
}

const MAX_HEIGHT = 32_760;
const MAX_BYTES = 4 * 1024 * 1024;
const escapeXml = (value: unknown) => String(value).replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]!);
const localeName = (locale: Locale) => locale === "zh_CN" ? "zh-CN" : "en-US";
const money = (cents: number, locale: Locale) => new Intl.NumberFormat(localeName(locale), { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents / 100);
const percentage = (commissionBps: number | null | undefined, locale: Locale) => typeof commissionBps !== "number"
  ? locale === "en_US" ? "Uses item/store rate" : "跟随项目/店铺"
  : `${new Intl.NumberFormat(localeName(locale), { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(commissionBps / 100)}%`;

function scopeText(snapshot: EmployeeSummarySnapshot, locale: Locale) {
  const en = locale === "en_US";
  const payment = en
    ? ({ ALL: "All payments", CASH: "Cash", NON_CASH: "Card + gift card" } as const)[snapshot.paymentMethod]
    : ({ ALL: "全部付款", CASH: "现金", NON_CASH: "刷卡＋礼物卡" } as const)[snapshot.paymentMethod];
  const amount = en
    ? ({ ALL: "service + tips", SERVICE: "service only", TIP: "tips only" } as const)[snapshot.amountType]
    : ({ ALL: "大费＋小费", SERVICE: "仅大费", TIP: "仅小费" } as const)[snapshot.amountType];
  const highlight = snapshot.highlightFilter === "ALL"
    ? ""
    : en
      ? snapshot.highlightFilter === "ONLY_HIGHLIGHTED" ? " · highlighted only" : " · highlights excluded"
      : snapshot.highlightFilter === "ONLY_HIGHLIGHTED" ? " · 仅高亮" : " · 排除高亮";
  return `${payment} · ${amount}${highlight}`;
}

function layout(employeeCount: number) {
  if (employeeCount <= 30) return { width: 1080, columns: 2 };
  if (employeeCount <= 90) return { width: 1440, columns: 3 };
  if (employeeCount <= 400) return { width: 1920, columns: 4 };
  return { width: 1920, columns: 5 };
}

function employeeCard(snapshot: EmployeeSummarySnapshot, employee: EmployeeSummarySnapshot["employees"][number], index: number, x: number, y: number, width: number, locale: Locale) {
  const en = locale === "en_US";
  const rate = percentage(employee.defaultCommissionBps, locale);
  const variation = employee.hasDifferentItemCommission
    ? en ? " · some items differ" : " · 部分项目比例不同"
    : "";
  const valueFont = width < 400 ? 17 : 19;
  const formulaFont = width < 400 ? 14 : 16;
  const role = en
    ? ({ OWNER: "Owner", MANAGER: "Manager", EMPLOYEE: "Employee" } as const)[employee.role]
    : ({ OWNER: "店主", MANAGER: "经理", EMPLOYEE: "员工" } as const)[employee.role];
  return [
    `<rect x="${x}" y="${y}" width="${width}" height="252" rx="22" fill="#fff" stroke="#eadbd0" stroke-width="2" filter="url(#shadow)"/>`,
    `<text x="${x + 22}" y="${y + 35}" class="name">${escapeXml(employee.displayName)}</text>`,
    `<text x="${x + width - 22}" y="${y + 34}" text-anchor="end" class="badge">${escapeXml(`${role} · ${employee.recordCount} ${en ? "records" : "单"}`)}</text>`,
    `<text x="${x + 22}" y="${y + 70}" class="label">${escapeXml(en ? "Main service" : "主要项目")}</text>`,
    `<text x="${x + width / 2}" y="${y + 70}" text-anchor="middle" class="operator">＋</text>`,
    `<text x="${x + width - 22}" y="${y + 70}" text-anchor="end" class="label">${escapeXml(en ? "Add-ons" : "加项")}</text>`,
    `<text x="${x + 22}" y="${y + 95}" style="font-size:${valueFont}px" class="amount">${escapeXml(money(employee.mainServiceAmountCents, locale))}</text>`,
    `<text x="${x + width - 22}" y="${y + 95}" text-anchor="end" style="font-size:${valueFont}px" class="amount">${escapeXml(money(employee.addonTotalCents, locale))}</text>`,
    `<rect x="${x + 18}" y="${y + 111}" width="${width - 36}" height="42" rx="12" fill="#fbf1eb"/>`,
    `<text x="${x + width / 2}" y="${y + 138}" text-anchor="middle" style="font-size:${formulaFont}px" class="formula">${escapeXml(`= ${en ? "Fee base" : "大费基数"} ${money(employee.grossFeeBaseCents, locale)}`)}</text>`,
    `<text x="${x + width / 2}" y="${y + 181}" text-anchor="middle" style="font-size:${formulaFont}px" class="formula">${escapeXml(`${en ? "Commission" : "提成比例"} ${rate}${variation} · ${en ? "Service wage" : "大费工资"} ${money(employee.totalLargeFeeWageCents, locale)}`)}</text>`,
    `<line x1="${x + 20}" y1="${y + 198}" x2="${x + width - 20}" y2="${y + 198}" stroke="#eadbd0"/>`,
    `<text x="${x + width / 2}" y="${y + 229}" text-anchor="middle" style="font-size:${formulaFont}px" class="total">${escapeXml(`${money(employee.totalLargeFeeWageCents, locale)} ＋ ${en ? "Tips" : "小费工资"} ${money(employee.totalTipCents, locale)} = ${en ? "Period income" : "阶段总收入"} ${money(employee.employeeIncomeCents, locale)}`)}</text>`,
    `<text x="${x + 22}" y="${y + 246}" class="index">${String(index + 1).padStart(2, "0")}</text>`,
  ].join("");
}

function buildSvg(snapshot: EmployeeSummarySnapshot, locale: Locale) {
  const en = locale === "en_US";
  const { width, columns } = layout(snapshot.employees.length);
  const margin = 32;
  const gap = 16;
  const headerHeight = 210;
  const cardWidth = (width - margin * 2 - gap * (columns - 1)) / columns;
  const rows = Math.ceil(snapshot.employees.length / columns);
  const height = headerHeight + rows * (252 + gap) + 26;
  if (height > MAX_HEIGHT) throw new Error("Employee summary has too many cards for one readable Messages image; narrow the employee selection");
  const parts = [
    `<text x="${margin}" y="48" class="eyebrow">${escapeXml(snapshot.storeName)}</text>`,
    `<text x="${margin}" y="101" class="title">${escapeXml(en ? "Employee subtotals" : "员工小计")}</text>`,
    `<text x="${margin}" y="139" class="meta">${escapeXml(`${snapshot.dateFrom} — ${snapshot.dateTo} · ${scopeText(snapshot, locale)}`)}</text>`,
    `<rect x="${margin}" y="158" width="${width - margin * 2}" height="36" rx="18" fill="#8e3e2f"/>`,
    `<text x="${margin + 18}" y="182" class="scope">${escapeXml(en ? `${snapshot.employees.length} employees · amounts retain cents · current commission settings shown` : `${snapshot.employees.length} 位员工 · 金额保留美分 · 显示当前提成设置`)}</text>`,
  ];
  snapshot.employees.forEach((employee, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    parts.push(employeeCard(snapshot, employee, index, margin + column * (cardWidth + gap), headerHeight + row * (252 + gap), cardWidth, locale));
  });
  parts.push(`<text x="${width - margin}" y="${height - 9}" text-anchor="end" class="footer">${escapeXml(en ? "Commission shows the employee setting; service wage + tips = period income" : "提成比例显示员工设置；大费工资 ＋ 小费工资 = 阶段总收入")}</text>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fffaf3"/><stop offset="1" stop-color="#f2d7cb"/></linearGradient><filter id="shadow" x="-10%" y="-10%" width="120%" height="130%"><feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#7a4432" flood-opacity=".10"/></filter><style>text{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif;fill:#211d18}.eyebrow{font-size:23px;font-weight:750;fill:#8e3e2f}.title{font-size:48px;font-weight:900}.meta{font-size:21px;font-weight:650;fill:#6b635a}.scope{font-size:17px;font-weight:750;fill:#fff}.name{font-size:25px;font-weight:900}.badge{font-size:14px;font-weight:800;fill:#8e3e2f}.label{font-size:14px;font-weight:750;fill:#756b62}.operator{font-size:19px;font-weight:900;fill:#a28f82}.amount{font-weight:900}.formula{font-weight:850}.total{font-weight:900;fill:#8e3e2f}.index{font-size:10px;font-weight:800;fill:#b9aaa0}.footer{font-size:13px;font-weight:650;fill:#756b62}</style></defs><rect width="${width}" height="${height}" fill="url(#bg)"/>${parts.join("")}</svg>`;
  return { svg, width, height };
}

export async function renderEmployeeSummaryImage(snapshot: EmployeeSummarySnapshot, locale: Locale, workDir: string, outputPath: string) {
  const { svg, width, height } = buildSvg(snapshot, locale);
  await writeFile(join(workDir, "employee-summary.svg"), svg);
  const attempts = [{ width, quality: 84 }, { width: Math.round(width * .85), quality: 72 }, { width: Math.round(width * .7), quality: 62 }];
  let lastSize = 0;
  for (const attempt of attempts) {
    const resizedHeight = Math.round((height * attempt.width) / width);
    const image = await sharp(Buffer.from(svg), { density: 72, limitInputPixels: false })
      .resize({ width: attempt.width, height: resizedHeight, fit: "fill" })
      .jpeg({ quality: attempt.quality, chromaSubsampling: height > 20_000 ? "4:2:0" : "4:4:4" })
      .toBuffer();
    lastSize = image.length;
    if (image.length <= MAX_BYTES) {
      await writeFile(outputPath, image);
      return { width: attempt.width, height: resizedHeight, byteLength: image.length };
    }
  }
  throw new Error(`Employee summary image is too large for Messages (${lastSize} bytes)`);
}
