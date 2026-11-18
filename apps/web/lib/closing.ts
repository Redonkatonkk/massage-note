import type { ClosingPreview, ClosingWarning } from "./types";

export function isBlockingClosingWarning(warning: ClosingWarning): boolean {
  return warning.blocking ?? warning.code !== "MANUAL_PRICE";
}

export function hasBlockingClosingWarnings(
  warnings: ClosingWarning[],
): boolean {
  return warnings.some(isBlockingClosingWarning);
}

export function hasUnsettledClosingCash(warnings: ClosingWarning[]): boolean {
  return warnings.some(warning => warning.code === "CASH_UNSETTLED");
}

export type HomeClosingAction = "CANCEL" | "CLOSE" | "REVIEW" | "CONFIRM_CASH";

export function homeClosingAction(
  preview: Pick<ClosingPreview, "isClosed" | "warnings">,
): HomeClosingAction {
  if (preview.isClosed) return "CANCEL";
  if (hasUnsettledClosingCash(preview.warnings)) return "CONFIRM_CASH";
  return hasBlockingClosingWarnings(preview.warnings) ? "REVIEW" : "CLOSE";
}
