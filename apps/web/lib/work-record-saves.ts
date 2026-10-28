import { ApiError, apiRequest, errorMessage } from "./api";
import { browserStorage } from "./browser-storage";
import type { SaveMotion } from "./work-record-save-motion";
import type { WorkRecord } from "./types";

export interface SaveScope { storeId: string; businessDate: string }
export type WorkRecordSaveDraft = {
  kind: "quick";
  employeeId: string;
  serviceId: string;
  mode: "NORMAL" | "PLACEHOLDER" | "DISPATCH_EXCLUDED" | "HIGHLIGHTED";
  startTime: string;
} | {
  kind: "editor";
  record: WorkRecord;
  isNew: boolean;
  initialServiceItemId?: string | undefined;
  fields: Record<string, unknown>;
};
export interface PreparedRecordSave {
  path: string;
  method: "POST" | "PATCH";
  body: unknown;
  fields: Record<string, unknown>;
  dialog: HTMLElement | null;
  employeeId: string;
  draftKey?: string | undefined;
}
export interface WorkRecordSaveInput extends SaveScope {
  id: string;
  storeName: string;
  employeeName: string;
  recordId?: string | undefined;
  request: Pick<PreparedRecordSave, "path" | "method" | "body">;
  draft: WorkRecordSaveDraft;
  draftKey?: string | undefined;
  motion?: SaveMotion | undefined;
}
export interface WorkRecordSaveTask extends Omit<WorkRecordSaveInput, "motion"> {
  status: "saving" | "syncing" | "failed" | "uncertain" | "syncFailed" | "saved";
  error: string;
  code?: string | undefined;
  latestResource?: unknown;
  savedRecord?: WorkRecord;
}
interface Entry { task: WorkRecordSaveTask; motion?: SaveMotion | undefined; finishing: boolean }
export interface SaveView extends SaveScope { refresh: () => Promise<void> }
const sameScope = (a: SaveScope, b: SaveScope) => a.storeId === b.storeId && a.businessDate === b.businessDate;
export const unresolvedWrite = (task: WorkRecordSaveTask) => task.status === "saving" || task.status === "uncertain";
export const recordSaveLocked = (task: WorkRecordSaveTask) => unresolvedWrite(task) || task.status === "syncing" || task.status === "syncFailed";

/** Page-owned writes survive dialog/board unmounts. Presentation never owns a request. */
export function createWorkRecordSaveManager(write: (path: string, options: {
  method: "POST" | "PATCH"; body: unknown; idempotent: boolean; headers: Record<string, string>;
}) => Promise<WorkRecord> = apiRequest<WorkRecord>) {
  const entries = new Map<string, Entry>();
  const listeners = new Set<() => void>();
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let view: SaveView | undefined;
  let disposed = false;
  let completionTail = Promise.resolve();
  let snapshot: { tasks: WorkRecordSaveTask[]; recovery: string | null; restoreBlocked: boolean } = { tasks: [], recovery: null, restoreBlocked: false };
  const cancelMotion = (entry: Entry) => {
    const motion = entry.motion; entry.motion = undefined;
    try { motion?.cancel(); } catch { /* Presentation cleanup cannot affect write state. */ }
  };
  const publish = () => {
    if (disposed) return;
    let waitingShown = false;
    for (const entry of entries.values()) {
      const waiting = !entry.finishing && ["saving", "syncing"].includes(entry.task.status);
      try { entry.motion?.setWaitingVisible?.(waiting && !waitingShown); } catch { cancelMotion(entry); }
      if (waiting && entry.motion) waitingShown = true;
    }
    snapshot = { ...snapshot, tasks: [...entries.values()].map(({ task }) => ({ ...task })) };
    listeners.forEach(listener => listener());
  };
  const forget = (id: string) => {
    const entry = entries.get(id); if (entry) cancelMotion(entry); entries.delete(id);
    if (snapshot.recovery === id) snapshot = { ...snapshot, recovery: null };
    publish();
  };
  const synchronize = async (entry: Entry) => {
    const task = entry.task;
    const selectedView = view;
    try {
      if (selectedView && sameScope(task, selectedView)) await selectedView.refresh();
    } catch (error) {
      if (disposed) return;
      task.status = "syncFailed"; task.error = errorMessage(error); cancelMotion(entry); publish();
      return;
    }
    if (disposed) return;
    // Reserve the completion slot in response-arrival order, independently of read speed.
    return async () => {
      if (disposed) return;
      entry.finishing = true; publish();
      try {
        const visible = selectedView && view === selectedView && sameScope(task, selectedView);
        if (visible) await entry.motion?.complete(task.savedRecord?.id);
        else cancelMotion(entry);
      } catch { /* A graphics failure cannot turn a committed write into a retry. */ }
      if (disposed) return;
      cancelMotion(entry);
      task.status = "saved"; task.error = ""; publish();
      const timer = setTimeout(() => { timers.delete(timer); forget(task.id); }, 2200);
      timers.add(timer);
    };
  };
  const sync = (entry: Entry) => {
    entry.task.status = "syncing"; entry.task.error = ""; publish();
    const ready = synchronize(entry);
    completionTail = completionTail.then(async () => { const finish = await ready; await finish?.(); }).catch(() => undefined);
  };
  const run = async (entry: Entry) => {
    const task = entry.task;
    task.status = "saving"; task.error = ""; publish();
    try {
      const saved = await write(task.request.path, {
        method: task.request.method, body: task.request.body, idempotent: true,
        headers: { "Idempotency-Key": task.id },
      });
      if (disposed) return;
      task.savedRecord = saved;
      task.recordId = saved.id;
      if (task.draftKey) browserStorage.removeItem(task.draftKey);
      sync(entry);
    } catch (error) {
      if (disposed) return;
      const uncertain = !(error instanceof ApiError) || error.status >= 500 || error.status === 408 ||
        ["IDEMPOTENCY_REQUEST_IN_PROGRESS", "IDEMPOTENCY_KEY_EXPIRED"].includes(error.code);
      task.status = uncertain ? "uncertain" : "failed";
      task.error = errorMessage(error);
      if (error instanceof ApiError) { task.code = error.code; task.latestResource = error.latestResource; }
      cancelMotion(entry); publish();
    }
  };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => snapshot,
    setRestoreBlocked(blocked: boolean) {
      if (snapshot.restoreBlocked === blocked) return;
      snapshot = { ...snapshot, restoreBlocked: blocked }; publish();
    },
    leaveView() { view = undefined; },
    registerView(next: SaveView) { view = next; return () => { if (view === next) view = undefined; }; },
    submit(input: WorkRecordSaveInput) {
      if (disposed || entries.has(input.id) || (input.recordId && [...entries.values()].some(({ task }) =>
        task.storeId === input.storeId && task.recordId === input.recordId && recordSaveLocked(task)))) {
        try { input.motion?.cancel(); } catch { /* A duplicate remains rejected. */ }
        return false;
      }
      const { motion, ...data } = input;
      const task: WorkRecordSaveTask = { ...JSON.parse(JSON.stringify(data)), status: "saving", error: "" };
      const entry: Entry = { task, motion, finishing: false };
      entries.set(task.id, entry); void run(entry); return true;
    },
    retry(id: string) {
      const entry = entries.get(id);
      if (entry?.task.status === "uncertain") void run(entry);
      else if (entry?.task.status === "syncFailed") sync(entry);
    },
    requestRecovery(id: string) {
      if (entries.get(id)?.task.status !== "failed") return;
      snapshot = { ...snapshot, recovery: id }; publish();
    },
    takeRecovery(scope: SaveScope) {
      const task = snapshot.tasks.find(task => task.id === snapshot.recovery && sameScope(task, scope));
      if (!task || task.status !== "failed") return;
      forget(task.id); return task;
    },
    dispose() {
      disposed = true; view = undefined; listeners.clear();
      timers.forEach(clearTimeout); timers.clear();
      entries.forEach(cancelMotion); entries.clear();
    },
  };
}
export type WorkRecordSaveManager = ReturnType<typeof createWorkRecordSaveManager>;
