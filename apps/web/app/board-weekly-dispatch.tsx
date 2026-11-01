"use client";

import { useAutoDismissState } from "./use-auto-dismiss-state";
import { useEffect, useRef, useState } from "react";
import { apiRequest, errorMessage } from "../lib/api";
import { useLanguage } from "./language-provider";
import type { StoreMember, WeeklyDispatchConfig, WeeklyDispatchDay, WeeklyDispatchSchedule } from "../lib/types";

const days: Array<{ key: WeeklyDispatchDay; label: string; english: string }> = [
  { key: "monday", label: "星期一", english: "Monday" }, { key: "tuesday", label: "星期二", english: "Tuesday" },
  { key: "wednesday", label: "星期三", english: "Wednesday" }, { key: "thursday", label: "星期四", english: "Thursday" },
  { key: "friday", label: "星期五", english: "Friday" }, { key: "saturday", label: "星期六", english: "Saturday" },
  { key: "sunday", label: "星期日", english: "Sunday" },
];
const emptySchedule = (): WeeklyDispatchSchedule => ({ monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] });

export function BoardWeeklyDispatch({ storeId, businessDate, members, disabled, onSaved, setupRequest = 0 }: { storeId: string; businessDate: string; members: StoreMember[]; disabled: boolean; onSaved: () => Promise<void>; setupRequest?: number }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const generation = useRef(0);
  const [schedule, setSchedule] = useState<WeeklyDispatchSchedule>(emptySchedule);
  const [version, setVersion] = useState(0);
  const [boardVersion, setBoardVersion] = useState(0);
  const [fullOrder, setFullOrder] = useState<string[]>([]);
  const [readOnly, setReadOnly] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const drag = useRef<{ id: string; initial: string[]; pointerId: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useAutoDismissState("");
  const { locale } = useLanguage();
  const text = (zh: string, en: string) => locale === "en-US" ? en : zh;
  const employees = members.filter(member => member.status === "ACTIVE" && member.isServiceProvider && !member.deletedAt);
  const full = fullOrder.flatMap(id => employees.filter(member => member.id === id && member.employmentType === "FULL_TIME"));
  const ordered = [...full, ...employees.filter(member => member.employmentType !== "FULL_TIME")];

  async function open() {
    const requestGeneration = ++generation.current;
    setBusy(true); setError("");
    try {
      const config = await apiRequest<WeeklyDispatchConfig>(`/stores/${storeId}/weekly-dispatch?businessDate=${businessDate}`);
      if (requestGeneration !== generation.current) return;
      const activeIds = new Set(employees.map(member => member.id));
      const cleaned = emptySchedule();
      for (const day of days) cleaned[day.key] = config.schedule[day.key].filter(id => activeIds.has(id));
      const fullIds = employees.filter(member => member.employmentType === "FULL_TIME").map(member => member.id);
      const initial = (config.fullTimeOrder ?? []).filter(id => fullIds.includes(id));
      setFullOrder([...initial, ...fullIds.filter(id => !initial.includes(id))]);
      setNeedsSetup(config.fullTimeOrder === null && fullIds.length > 0);
      setReadOnly(config.orderReadOnly); setBoardVersion(config.boardVersion);
      setSchedule(cleaned); setVersion(config.version);
      dialog.current?.showModal();
    } catch (caught) { if (requestGeneration === generation.current) setError(errorMessage(caught)); }
    finally { if (requestGeneration === generation.current) setBusy(false); }
  }
  useEffect(() => { generation.current++; dialog.current?.close(); drag.current = null; setDragging(null); setBusy(false); return () => { generation.current++; }; }, [storeId, businessDate]);
  useEffect(() => { if (setupRequest > 0) void open(); }, [setupRequest]);

  function move(id: string, target: string) {
    if (readOnly || busy || disabled || id === target) return;
    setFullOrder(current => {
      if (!current.includes(id) || !current.includes(target)) return current;
      const next = current.filter(value => value !== id);
      next.splice(current.indexOf(target), 0, id);
      return next;
    });
  }
  function toggle(day: WeeklyDispatchDay, memberId: string) {
    setSchedule(current => ({ ...current, [day]: current[day].includes(memberId) ? current[day].filter(id => id !== memberId) : [...current[day], memberId] }));
  }
  async function save() {
    if (submitting.current || busy || disabled) return;
    const requestGeneration = generation.current;
    submitting.current = true; setBusy(true); setError("");
    try {
      await apiRequest(`/stores/${storeId}/weekly-dispatch`, { method: "PUT", idempotent: true, body: { version, schedule, ...(!readOnly ? { businessDate, boardVersion, fullTimeOrder: fullOrder } : {}) } });
      if (requestGeneration !== generation.current) return;
      dialog.current?.close();
      await onSaved();
    } catch (caught) { if (requestGeneration === generation.current) setError(errorMessage(caught)); }
    finally { submitting.current = false; if (requestGeneration === generation.current) setBusy(false); }
  }
  return <>
    <button className="secondary-action weekly-dispatch-trigger" type="button" disabled={disabled || busy} onClick={() => void open()}>{text("每周排工", "Weekly schedule")}</button>
    {error && !dialog.current?.open && <p className="form-error" role="alert">{error}</p>}
    <dialog ref={dialog} className="board-delivery-dialog weekly-dispatch-dialog" aria-labelledby="weekly-dispatch-title" onCancel={event => { if (busy) event.preventDefault(); }}>
      <div className="modal-heading"><div><p className="eyebrow">{businessDate}</p><h2 id="weekly-dispatch-title">{text("每周排工", "Weekly schedule")}</h2></div><button className="close-button" type="button" disabled={busy} onClick={() => dialog.current?.close()}>{text("取消", "Cancel")}</button></div>
      <p className="field-help">{text("拖动全职整行调整所选日期的内部顺序，包括当天休息者。也可聚焦排序手柄后按上下方向键。保存会同时提交每周出勤与该日内部顺序；保存后需点击生成顺序，才会重排当前表格。", "Drag full-time rows to set this date’s internal order, including staff resting that day. You can also focus a reorder handle and use the arrow keys. Save submits weekly attendance and this date’s internal order together. Generate the order afterwards to reorder the current board.")}</p>
      {needsSetup && <p className="field-help" role="status">{text("内部顺序尚未初始化或历史数据缺失。请确认完整全职顺序，保存后再次点击生成顺序。", "The internal order is uninitialized or history is missing. Confirm the complete full-time order, save, then generate the order again.")}</p>}
      {readOnly && <p className="field-help">{text("所选日期已日结或属于历史日期，内部顺序只读；仍可修改每周出勤设置。", "The selected date is closed or historical. Its internal order is read-only; weekly attendance can still be edited.")}</p>}
      <p className="field-help weekly-dispatch-scroll-hint">{text("左右滑动查看整周。", "Scroll horizontally to see the whole week.")}</p>
      <div className="weekly-dispatch-table-wrap"><table className="weekly-dispatch-table"><thead><tr><th scope="col">{text("员工", "Employee")}</th><th scope="col">{text("全职／兼职", "Employment")}</th>{days.map(day => <th scope="col" key={day.key}>{text(day.label, day.english)}</th>)}</tr></thead><tbody>{ordered.map(member => <tr key={member.id} data-full-time-id={member.employmentType === "FULL_TIME" ? member.id : undefined} className={dragging === member.id ? "weekly-dispatch-row--dragging" : undefined}
        onPointerDown={event => {
          if (member.employmentType !== "FULL_TIME" || readOnly || busy || disabled || !event.isPrimary || event.button !== 0 || (event.target as HTMLElement).closest("input, label")) return;
          drag.current = { id: member.id, initial: fullOrder, pointerId: event.pointerId }; setDragging(member.id);
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }} onPointerMove={event => {
          if (!drag.current || drag.current.pointerId !== event.pointerId) return;
          const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("tr[data-full-time-id]");
          if (target && event.currentTarget.closest("tbody")?.contains(target)) move(drag.current.id, target.dataset.fullTimeId!);
        }} onPointerUp={() => { drag.current = null; setDragging(null); }} onPointerCancel={() => { if (drag.current) setFullOrder(drag.current.initial); drag.current = null; setDragging(null); }}>
        <th scope="row">{member.employmentType === "FULL_TIME" && <button className="weekly-order-handle" type="button" disabled={busy || readOnly || disabled} aria-label={text(`调整 ${member.displayName} 的全职顺序`, `Reorder ${member.displayName}`)} onKeyDown={event => {
          if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
          event.preventDefault(); const target = fullOrder[fullOrder.indexOf(member.id) + (event.key === "ArrowUp" ? -1 : 1)]; if (target) move(member.id, target);
        }}>↕</button>}{member.displayName}</th><td>{member.employmentType === "FULL_TIME" ? text("全职", "Full-time") : member.employmentType === "PART_TIME" ? text("兼职", "Part-time") : text("未设置", "Not set")}</td>{days.map(day => <td key={day.key}><label aria-label={`${member.displayName} ${text(day.label, day.english)}`}><input type="checkbox" checked={schedule[day.key].includes(member.id)} disabled={busy} onChange={() => toggle(day.key, member.id)} /></label></td>)}</tr>)}</tbody></table></div>
      {employees.length === 0 && <p className="empty-state">{text("目前没有在职的上班人员。", "No active service providers.")}</p>}
      {error && <p className="form-error" role="alert">{error}<br /><span>{text("请取消后重新打开，核对最新设置再保存。", "Cancel and reopen to review the latest settings before saving.")}</span></p>}
      <div className="modal-actions"><button className="primary-action" type="button" disabled={busy} onClick={() => void save()}>{busy ? text("正在保存…", "Saving…") : text("保存设置", "Save settings")}</button></div>
    </dialog>
  </>;
}
