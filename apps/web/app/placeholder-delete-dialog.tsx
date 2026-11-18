"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ApiError, errorMessage } from "../lib/api";
import { deletePlaceholder } from "../lib/delete-placeholder";
import { displayTime } from "../lib/time";
import { preloadWorkRecordDeleteMotion } from "../lib/work-record-delete-motion";
import type { WorkRecord } from "../lib/types";
import { useNativeDialog } from "./use-native-dialog";
import { useWorkRecordFeedback } from "./work-record-feedback";

export function PlaceholderDeleteDialog({ storeId, record, employeeName, timezone, canDelete, isClosed, onClose, onChanged }: {
  storeId: string; record: WorkRecord; employeeName: string; timezone: string; canDelete: boolean; isClosed: boolean;
  onClose: () => void; onChanged: () => Promise<void>;
}) {
  const { showDeleted } = useWorkRecordFeedback();
  const [dialog, dialogRef] = useNativeDialog(true);
  const actionInFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [blockedByClosing, setBlockedByClosing] = useState(false);
  const [error, setError] = useState("");
  const dayClosed = isClosed || blockedByClosing;

  useEffect(() => {
    preloadWorkRecordDeleteMotion();
    const previousFocus = document.activeElement;
    dialog.current?.showModal();
    return () => { if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true }); };
  }, []);

  async function remove() {
    if (actionInFlight.current || !canDelete || dayClosed) return;
    actionInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await deletePlaceholder(storeId, record, (deletedRecord, cancelMotion) => {
        dialog.current?.setAttribute("data-motion-skip-exit", "");
        showDeleted(storeId, deletedRecord, onChanged, cancelMotion);
        onClose();
      }, onChanged);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "BUSINESS_DAY_CLOSED") setBlockedByClosing(true);
      setError(errorMessage(caught));
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  }

  return createPortal(<dialog ref={dialogRef} className="board-delivery-dialog placeholder-delete-dialog" aria-modal="true" aria-labelledby="placeholder-delete-title"
    onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <div className="modal-heading"><h2 id="placeholder-delete-title">删除占位</h2><button className="close-button" type="button" disabled={busy} onClick={onClose}>取消</button></div>
    <p>{employeeName} · {record.businessDate.slice(0, 10)} · {displayTime(record.startAt, timezone)}</p>
    <p className="field-help">确认删除这张占位小卡吗？删除后主表将隐藏，店长或经理可以从回收站恢复。</p>
    {dayClosed && <p className="closed-banner">这个营业日已经日结，请先取消日结再删除占位。</p>}
    {!canDelete && <p className="field-help">历史记录只读</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button className="delete-record" type="button" disabled={busy || dayClosed || !canDelete} onClick={() => void remove()}>{busy ? "处理中…" : "删除占位"}</button>
  </dialog>, document.body);
}
