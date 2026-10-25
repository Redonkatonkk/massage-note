import { createEmployeeSettlementSvg } from "@massage-note/domain";
import type { AppLocale } from "./i18n";
import { generateSvgPng } from "./svg-png";
import type { EmployeeSettlementPreview } from "./types";

export interface GeneratedSettlementImage {
  url: string;
  fileName: string;
}

export async function generateEmployeeSettlementImage(preview: EmployeeSettlementPreview, locale: AppLocale): Promise<GeneratedSettlementImage> {
  const source = createEmployeeSettlementSvg(preview, locale === "en-US" ? "en_US" : "zh_CN");
  const image = await generateSvgPng(source);
  const name = preview.employee.displayName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_");
  return { url: image.url, fileName: `${name}_${preview.dateFrom}_${preview.dateTo}_${preview.paymentScope}_${preview.amountType ?? "ALL"}.png` };
}
