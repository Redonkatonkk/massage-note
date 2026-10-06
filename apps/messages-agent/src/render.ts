import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { createEmployeeClosingSvg, type ClosingSnapshot, type ImageLocale } from "@massage-note/domain";

export type { ClosingSnapshot } from "@massage-note/domain";

const execFileAsync = promisify(execFile);

export async function renderClosingPng(snapshot: ClosingSnapshot, locale: ImageLocale, svgPath: string, pngPath: string) {
  const { svg } = createEmployeeClosingSvg(snapshot, locale);
  await writeFile(svgPath, svg, "utf8");
  await execFileAsync("/usr/bin/sips", ["-s", "format", "png", svgPath, "--out", pngPath]);
}
