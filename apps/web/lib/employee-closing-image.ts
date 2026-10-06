import { createEmployeeClosingSvg } from "@massage-note/domain";
import type { AppLocale } from "./i18n";
import type { EmployeeClosingPreview } from "./types";

export interface GeneratedClosingImage {
  blob: Blob;
  fileName: string;
  height: number;
  url: string;
  width: number;
}

export async function generateEmployeeClosingImage(preview: EmployeeClosingPreview, locale: AppLocale): Promise<GeneratedClosingImage> {
  const source = createEmployeeClosingSvg(preview, locale === "en-US" ? "en_US" : "zh_CN");
  const svgUrl = URL.createObjectURL(new Blob([source.svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("图片生成失败，请重试"));
      image.src = svgUrl;
    });
    const logicalWidth = Math.max(1, Math.round(window.screen?.width || window.innerWidth));
    const pixelRatio = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const scale = Math.min(logicalWidth * pixelRatio / source.width, 16_384 / source.height, Math.sqrt(16_000_000 / (source.width * source.height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(source.width * scale));
    canvas.height = Math.max(1, Math.floor(source.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前设备无法生成图片");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      value => value ? resolve(value) : reject(new Error("图片生成失败，请重试")), "image/png",
    ));
    return {
      blob,
      fileName: `${locale === "en-US" ? "employee-closing" : "个人日结"}-${preview.employee.displayName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "-")}-${preview.businessDate}.png`,
      width: canvas.width, height: canvas.height, url: URL.createObjectURL(blob),
    };
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
