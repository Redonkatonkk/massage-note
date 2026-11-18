import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import {
  escapeImageXml as escapeXml, formatImageMoney as money, imageLineHeight,
  imageLocaleName as localeName, imageTextLines, imageTheme as theme, type ImageLocale as Locale,
} from "@massage-note/domain";

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

function summaryText(value: string, x: number, y: number, width: number, font: number, pitch: number, style: string, align = "start") {
  // Leave room for the font fallback used by the Messages renderer.
  const wrapSize = font * 1.12;
  return {
    svg: imageTextLines(value, width, wrapSize, x, y, style, pitch, align).replace("<text ", `<text font-size="${font}" `),
    height: imageLineHeight(value, width, wrapSize, pitch),
  };
}

function employeeCard(employee: EmployeeSummarySnapshot["employees"][number], width: number, locale: Locale) {
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
  const inset = 22;
  const contentWidth = width - inset * 2;
  const name = summaryText(employee.displayName, inset, 36, contentWidth, 25, 32, "name");
  const roleY = 27 + name.height;
  const labelY = roleY + 29;
  const amountY = labelY + 23;
  const amountWidth = contentWidth / 2 - 12;
  const serviceAmount = summaryText(money(employee.mainServiceAmountCents, locale), inset, amountY, amountWidth, valueFont, 23, "amount");
  const addonAmount = summaryText(money(employee.addonTotalCents, locale), width - inset, amountY, amountWidth, valueFont, 23, "amount", "end");
  const baseY = amountY + Math.max(serviceAmount.height, addonAmount.height) + 10;
  const feeBase = summaryText(`= ${en ? "Fee base" : "大费基数"} ${money(employee.grossFeeBaseCents, locale)}`, inset, baseY, contentWidth, formulaFont, 20, "formula");
  const commissionY = baseY + feeBase.height + 13;
  const commission = summaryText(`${en ? "Commission" : "提成比例"} ${rate}${variation} · ${en ? "Service wage" : "大费工资"} ${money(employee.totalLargeFeeWageCents, locale)}`, inset, commissionY, contentWidth, formulaFont, 20, "formula");
  const totalY = commissionY + commission.height + 11;
  const total = summaryText(`${money(employee.totalLargeFeeWageCents, locale)} ＋ ${en ? "Tips" : "小费工资"} ${money(employee.totalTipCents, locale)} = ${en ? "Period income" : "阶段总收入"} ${money(employee.employeeIncomeCents, locale)}`, inset, totalY, contentWidth, formulaFont, 20, "total");
  return {
    height: totalY + total.height,
    content: [
      name.svg,
      `<text x="${inset}" y="${roleY}" font-size="14" class="meta">${escapeXml(`${role} · ${employee.recordCount} ${en ? "records" : "单"}`)}</text>`,
      `<text x="${inset}" y="${labelY}" font-size="14" class="meta">${en ? "Main service" : "主要项目"}</text>`,
      `<text x="${width / 2}" y="${labelY}" font-size="14" text-anchor="middle" class="meta">＋</text>`,
      `<text x="${width - inset}" y="${labelY}" font-size="14" text-anchor="end" class="meta">${en ? "Add-ons" : "加项"}</text>`,
      serviceAmount.svg, addonAmount.svg,
      `<line x1="${inset}" x2="${width - inset}" y1="${baseY - 19}" y2="${baseY - 19}" stroke="${theme.line}"/>`,
      feeBase.svg, commission.svg, total.svg,
    ].join(""),
  };
}

function buildSvg(snapshot: EmployeeSummarySnapshot, locale: Locale) {
  const en = locale === "en_US";
  const { width, columns } = layout(snapshot.employees.length);
  const margin = 32;
  const gap = 16;
  const cardWidth = (width - margin * 2 - gap * (columns - 1)) / columns;
  const contentWidth = width - margin * 2;
  const store = summaryText(snapshot.storeName, margin, 47, contentWidth, 22, 28, "meta");
  const titleY = 65 + store.height;
  const scopeY = titleY + 35;
  const scope = summaryText(`${snapshot.dateFrom} — ${snapshot.dateTo} · ${scopeText(snapshot, locale)}`, margin, scopeY, contentWidth, 20, 25, "meta");
  const noteY = scopeY + scope.height + 5;
  const parts = [
    store.svg,
    `<text x="${margin}" y="${titleY}" font-size="42" class="title">${en ? "Employee subtotals" : "员工小计"}</text>`,
    scope.svg,
    `<text x="${margin}" y="${noteY}" font-size="17" class="meta">${en ? `${snapshot.employees.length} employees · amounts retain cents · current commission settings shown` : `${snapshot.employees.length} 位员工 · 金额保留美分 · 显示当前提成设置`}</text>`,
  ];
  let rowY = noteY + 24;
  const cards = snapshot.employees.map(employee => employeeCard(employee, cardWidth, locale));
  for (let index = 0; index < cards.length; index += columns) {
    const row = cards.slice(index, index + columns);
    const rowHeight = Math.max(...row.map(card => card.height));
    row.forEach((card, column) => {
      const x = margin + column * (cardWidth + gap);
      parts.push(`<g transform="translate(${x} ${rowY})"><rect width="${cardWidth}" height="${rowHeight}" rx="${theme.radius}" fill="${theme.surface}" stroke="${theme.line}"/>${card.content}</g>`);
    });
    rowY += rowHeight + gap;
  }
  const height = rowY + margin - gap;
  if (height > MAX_HEIGHT) throw new Error("Employee summary has too many cards for one readable Messages image; narrow the employee selection");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <style>
      text { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; fill: ${theme.ink}; }
      .title, .name, .amount, .total { font-weight: 650; }
      .meta { fill: ${theme.muted}; }
      .total { fill: ${theme.brand}; }
    </style>
    <rect width="${width}" height="${height}" fill="${theme.page}"/>${parts.join("")}
  </svg>`;
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
