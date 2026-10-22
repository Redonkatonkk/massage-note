import type { StoreBackupMode } from "@massage-note/contracts";
import { apiBase, ApiError } from "./api";

export async function downloadStoreBackup(storeId: string, mode: StoreBackupMode, signal: AbortSignal, previewId?: string): Promise<void> {
  const params = new URLSearchParams({ mode });
  if (previewId) params.set("previewId", previewId);
  const response = await fetch(`${apiBase}/stores/${storeId}/data/export?${params}`, { credentials: "include", signal });
  if (!response.ok) throw new ApiError(response.status, await response.json().catch(() => null));
  const blob = await response.blob();
  if (signal.aborted) return;
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = response.headers.get("Content-Disposition")?.match(/filename="([^"]+)"/)?.[1] ?? `massage-note-${mode}.json`;
    document.body.append(link); link.click(); link.remove();
  } finally { setTimeout(() => URL.revokeObjectURL(url), 1000); }
}

export function clearStoreDataDrafts(storeId: string, memberIds: string[]): void {
  try {
    const members = new Set(memberIds);
    for (const key of Object.keys(window.localStorage)) {
      if (!key.startsWith("massage_note_record_draft_")) continue;
      try {
        const draft = JSON.parse(window.localStorage.getItem(key) ?? "null") as { storeId?: string; employeeId?: string } | null;
        if (draft?.storeId === storeId || (!draft?.storeId && draft?.employeeId && members.has(draft.employeeId))) window.localStorage.removeItem(key);
      } catch { /* Unrelated or malformed drafts do not prevent a completed import. */ }
    }
  } catch { /* Storage may be unavailable; new record IDs also invalidate old drafts. */ }
}
