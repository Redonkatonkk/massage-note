import type { ClosingPreview, ClosingWarning } from "./types";

export function isBlockingClosingWarning(warning: ClosingWarning): boolean {
  return warning.blocking ?? warning.code !== "MANUAL_PRICE";
}

export function hasBlockingClosingWarnings(
  warnings: ClosingWarning[],
): boolean {
  return warnings.some(isBlockingClosingWarning);
}

export type HomeClosingAction = "CANCEL" | "CLOSE" | "REVIEW";

export function homeClosingAction(
  preview: Pick<ClosingPreview, "isClosed" | "warnings">,
): HomeClosingAction {
  if (preview.isClosed) return "CANCEL";
  return hasBlockingClosingWarnings(preview.warnings) ? "REVIEW" : "CLOSE";
}
