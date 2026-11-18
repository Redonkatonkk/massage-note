import { apiRequest } from "./api";
import type { WorkRecord } from "./types";
import { beginWorkRecordDeleteMotion } from "./work-record-delete-motion";

export async function deletePlaceholder(storeId: string, record: WorkRecord, onDeleted: (deleted: WorkRecord, cancelMotion: () => void) => void, onChanged: () => Promise<void>) {
  const deleted = await apiRequest<WorkRecord>(`/stores/${storeId}/work-records/${record.id}`, {
    method: "DELETE", idempotent: true, body: { version: record.version },
  });
  const motion = beginWorkRecordDeleteMotion(record.id);
  try {
    onDeleted(deleted, motion.cancel);
    await onChanged();
  } finally {
    await motion.finished;
    motion.cancel();
  }
}
