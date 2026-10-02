import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { createEmployeeSettlementSvg, type SettlementSnapshot } from "@massage-note/domain";
import type { Locale } from "./render-format.js";

export type { SettlementSnapshot } from "@massage-note/domain";

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

export async function renderSettlementLongImage(snapshot: SettlementSnapshot, locale: Locale, workDir: string, detailsImagePath: string) {
  const longDetails = createEmployeeSettlementSvg(snapshot, locale);
  await writeFile(join(workDir, "settlement-details-long.svg"), longDetails.svg, "utf8");
  const longImage = await renderLongDetailsImage(longDetails.svg, longDetails.width, longDetails.height, detailsImagePath);
  return { longImage };
}
