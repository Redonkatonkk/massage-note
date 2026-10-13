import { createEmployeeClosingSvg } from "@massage-note/domain";
import type { AppLocale } from "./i18n";
import { generateSvgPng, type GeneratedPng } from "./svg-png";
import type { EmployeeClosingPreview } from "./types";

export interface GeneratedClosingImage extends GeneratedPng {
  fileName: string;
}

export async function generateEmployeeClosingImage(preview: EmployeeClosingPreview, locale: AppLocale): Promise<GeneratedClosingImage> {
  const source = createEmployeeClosingSvg(preview, locale === "en-US" ? "en_US" : "zh_CN");
  const logicalWidth = Math.max(1, Math.round(window.screen?.width || window.innerWidth));
  const pixelRatio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const image = await generateSvgPng(source, logicalWidth * pixelRatio / source.width);
  return {
    ...image,
    fileName: `${locale === "en-US" ? "employee-closing" : "个人日结"}-${preview.employee.displayName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")}-${preview.businessDate}.png`,
  };
}
