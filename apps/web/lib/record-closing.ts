import { apiRequest } from "./api";
import type { ClosingPreview } from "./types";

export function closedRecordBusinessDate(resource: unknown, fallback: string): string {
  const date = (resource as { businessDate?: unknown } | null)?.businessDate;
  return typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date : fallback.slice(0, 10);
}

export async function reopenRecordBusinessDay(storeId: string, businessDate: string) {
  const path = `/stores/${storeId}/closings/${businessDate}`;
  const preview = await apiRequest<ClosingPreview>(`${path}/preview`);
  if (!preview.isClosed) return;
  if (!preview.activeClosing) throw new Error("日结状态已发生变化，请刷新后重试");
  await apiRequest(`${path}/cancel`, {
    method: "POST",
    idempotent: true,
    body: { version: preview.activeClosing.version },
  });
}
