import { createEmployeeSettlementSvg } from "@massage-note/domain";
import type { AppLocale } from "./i18n";
import type { EmployeeSettlementPreview } from "./types";

export interface GeneratedSettlementImage {
  url: string;
  fileName: string;
}

export async function generateEmployeeSettlementImage(preview: EmployeeSettlementPreview, locale: AppLocale): Promise<GeneratedSettlementImage> {
  const source = createEmployeeSettlementSvg(preview, locale === "en-US" ? "en_US" : "zh_CN");
  const svgUrl = URL.createObjectURL(new Blob([source.svg], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("图片生成失败，请重试"));
      image.src = svgUrl;
    });
    // Keep long exports within mobile canvas dimension and memory limits.
    const scale = Math.min(1, 16_384 / source.height, Math.sqrt(16_000_000 / (source.width * source.height)));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.floor(source.width * scale));
    canvas.height = Math.max(1, Math.floor(source.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("当前设备无法生成图片");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error("图片生成失败，请重试")), "image/png");
    });
    const name = preview.employee.displayName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_");
    return { url: URL.createObjectURL(blob), fileName: `${name}_${preview.dateFrom}_${preview.dateTo}_${preview.paymentScope}.png` };
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}
