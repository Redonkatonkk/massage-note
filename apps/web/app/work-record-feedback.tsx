"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { apiRequest, errorMessage } from "../lib/api";
import type { WorkRecord } from "../lib/types";
import { useAutoDismissState } from "./use-auto-dismiss-state";

type Deletion = Pick<WorkRecord, "id" | "version" | "status">;
type ShowDeletion = (storeId: string, record: Deletion, refresh: () => Promise<void>, cancelMotion: () => void) => void;
type Notice = { id: number; text: string; undo?: () => Promise<void> };

const WorkRecordFeedback = createContext({
  showSaved: (_isNew: boolean) => {},
  showDeleted: (() => {}) as ShowDeletion,
});

export function useWorkRecordFeedback() { return useContext(WorkRecordFeedback); }

export function WorkRecordFeedbackProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [error, setError] = useAutoDismissState("");
  const sequence = useRef(0);
  const dismiss = useCallback((id: number) => setNotices(current => current.filter(item => item.id !== id)), []);

  const notify = useCallback((text: string, undo?: () => Promise<void>) => {
    const notice = { id: ++sequence.current, text, ...(undo ? { undo } : {}) };
    setNotices(current => undo ? [notice, ...current] : [...current.filter(item => item.undo), notice]);
  }, []);
  const showSaved = useCallback((isNew: boolean) => notify(isNew ? "记工已保存" : "记工修改已保存"), [notify]);
  const showDeleted = useCallback<ShowDeletion>((storeId, record, refresh, cancelMotion) => {
    notify(record.status === "PLACEHOLDER" ? "占位已删除" : "记工已删除", async () => {
      await apiRequest(`/stores/${storeId}/work-records/${record.id}/restore`, {
        method: "POST", idempotent: true, body: { version: record.version, undoDelete: true },
      });
      cancelMotion();
      notify("删除已撤销");
      await refresh();
    });
  }, [notify]);
  const feedback = useMemo(() => ({ showSaved, showDeleted }), [showSaved, showDeleted]);

  return <WorkRecordFeedback.Provider value={feedback}>
    {children}
    {notices.length > 0 && createPortal(<div className="work-record-toasts">
      {notices.map(notice => <WorkRecordToast key={notice.id} notice={notice} dismiss={dismiss} onError={setError} />)}
    </div>, document.body)}
    {error && createPortal(<div className="record-error-toast" role="alert" aria-atomic="true">{error}</div>, document.body)}
  </WorkRecordFeedback.Provider>;
}

function WorkRecordToast({ notice, dismiss, onError }: { notice: Notice; dismiss: (id: number) => void; onError: (error: string) => void }) {
  const duration = notice.undo ? 5000 : 2000;
  const [undoing, setUndoing] = useState(false);
  const available = useRef(true);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => {
    const expire = () => { available.current = false; dismiss(notice.id); };
    timer.current = window.setTimeout(expire, duration);
    return () => window.clearTimeout(timer.current);
  }, [dismiss, duration, notice.id]);

  async function undo() {
    if (!notice.undo || !available.current) return;
    available.current = false;
    window.clearTimeout(timer.current);
    setUndoing(true);
    try {
      await notice.undo();
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      dismiss(notice.id);
    }
  }

  return <div className="work-record-toast">
    <div className="work-record-toast__message" role="status" aria-atomic="true"><span aria-hidden="true">✓</span>{notice.text}</div>
    {notice.undo && <button className="secondary-action work-record-toast__undo" type="button" disabled={undoing}
      onClick={() => void undo()}>{undoing ? "撤销中…" : "撤销"}</button>}
    <div className="work-record-toast__progress" aria-hidden="true"
      style={{ animationDuration: `${duration}ms`, animationPlayState: undoing ? "paused" : "running" }} />
  </div>;
}
