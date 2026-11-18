"use client";

import { useEffect, useRef, useState, type PointerEventHandler } from "react";
import { ApiError, errorMessage } from "../lib/api";
import { deletePlaceholder } from "../lib/delete-placeholder";
import { displayTime } from "../lib/time";
import type { WorkRecord } from "../lib/types";
import { preloadWorkRecordDeleteMotion } from "../lib/work-record-delete-motion";
import { useWorkRecordFeedback } from "./work-record-feedback";

interface PlaceholderCardProps {
  storeId: string;
  record: WorkRecord;
  timezone: string;
  canDelete: boolean;
  isClosed: boolean;
  locked: boolean;
  onChanged: () => Promise<void>;
  onError: (error: string) => void;
  onPointerMove: PointerEventHandler<HTMLDivElement>;
  onPointerLeave: PointerEventHandler<HTMLDivElement>;
  onPointerCancel: PointerEventHandler<HTMLDivElement>;
}

export function PlaceholderCard({ storeId, record, timezone, canDelete, isClosed, locked, onChanged, onError,
  onPointerMove, onPointerLeave, onPointerCancel }: PlaceholderCardProps) {
  const { showDeleted } = useWorkRecordFeedback();
  const [armedVersion, setArmedVersion] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [previousDeletedVersion, setPreviousDeletedVersion] = useState<number | null>(null);
  const deleted = previousDeletedVersion === record.version;
  const [blockedByClosing, setBlockedByClosing] = useState(false);
  const inFlight = useRef(false);
  const timeId = `placeholder-time-${record.id}`;
  const dayClosed = isClosed || blockedByClosing;
  const canConfirm = canDelete && !dayClosed && !locked && !deleted;
  const confirming = canConfirm && armedVersion === record.version;
  const showConfirmation = confirming && !busy;

  useEffect(() => { setBlockedByClosing(false); }, [isClosed]);
  useEffect(() => { if (!canConfirm) setArmedVersion(null); }, [canConfirm]);

  async function activateDelete() {
    if (!canConfirm || inFlight.current) return;
    if (!confirming) {
      preloadWorkRecordDeleteMotion();
      setArmedVersion(record.version);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    onError("");
    try {
      await deletePlaceholder(storeId, record, (deletedRecord, cancelMotion) => {
        setPreviousDeletedVersion(record.version);
        showDeleted(storeId, deletedRecord, onChanged, cancelMotion);
      }, onChanged);
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "BUSINESS_DAY_CLOSED") setBlockedByClosing(true);
      onError(errorMessage(caught));
    } finally {
      setArmedVersion(null);
      inFlight.current = false;
      setBusy(false);
    }
  }

  return <div className="record-card record-card--placeholder" data-work-record-id={record.id} data-motion-item={record.id} data-motion-skip-in
    data-placeholder-deleted={deleted || undefined} role="group" aria-label="占位" aria-describedby={timeId}
    title={locked ? "这条记工正在保存或同步，请稍候再试" : !canDelete ? "历史记录只读" : dayClosed ? "这个营业日已经日结，请先取消日结再删除占位。" : undefined}
    onPointerMove={canConfirm ? onPointerMove : undefined}
    onPointerLeave={event => {
      onPointerLeave(event);
      if (event.pointerType === "mouse" && !event.currentTarget.querySelector(":focus-visible")) setArmedVersion(null);
    }}
    onPointerCancel={event => { onPointerCancel(event); setArmedVersion(null); }}>
    <svg className="record-placeholder-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <line x1="0" y1="0" x2="100" y2="100" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      <line x1="100" y1="0" x2="0" y2="100" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
    <time id={timeId} className="record-time record-placeholder-time" dateTime={record.startAt}>{displayTime(record.startAt, timezone)}</time>
    <button className={`delete-record record-placeholder-delete${showConfirmation ? " delete-record--confirming" : ""}`} type="button"
      aria-label={busy ? "处理中…" : showConfirmation ? "确认删除" : "删除占位"} aria-describedby={timeId}
      disabled={!canConfirm || busy} data-motion-busy={busy} onBlur={() => setArmedVersion(null)}
      onKeyDown={event => {
        if (event.key === "Escape" && confirming) { event.preventDefault(); event.stopPropagation(); setArmedVersion(null); }
        if (event.repeat && (event.key === "Enter" || event.key === " ")) event.preventDefault();
      }}
      onClick={() => void activateDelete()}>
      <span className="delete-record__label" aria-hidden="true">{busy ? "处理中…" : "删除占位"}</span>
      <span className="delete-record__confirmation" aria-hidden="true">确认删除</span>
    </button>
  </div>;
}
