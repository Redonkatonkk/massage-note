"use client";

import { useAutoDismissState } from "./use-auto-dismiss-state";

import { useRef, useState } from "react";
import { apiRequest, errorMessage } from "../lib/api";
import type { StoreMember, WeeklyDispatchConfig, WeeklyDispatchDay, WeeklyDispatchSchedule } from "../lib/types";

const days: Array<{ key: WeeklyDispatchDay; label: string }> = [
  { key: "monday", label: "星期一" }, { key: "tuesday", label: "星期二" },
  { key: "wednesday", label: "星期三" }, { key: "thursday", label: "星期四" },
  { key: "friday", label: "星期五" }, { key: "saturday", label: "星期六" },
  { key: "sunday", label: "星期日" },
];
const emptySchedule = (): WeeklyDispatchSchedule => ({ monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] });

export function BoardWeeklyDispatch({ storeId, businessDate, members, disabled, onSaved }: { storeId: string; businessDate: string; members: StoreMember[]; disabled: boolean; onSaved: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [schedule, setSchedule] = useState<WeeklyDispatchSchedule>(emptySchedule);
  const [version, setVersion] = useState(0);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useAutoDismissState("");
  const employees = members.filter((member) => member.status === "ACTIVE" && member.isServiceProvider);

  async function open() {
    setBusy(true); setError("");
    try {
      const config = await apiRequest<WeeklyDispatchConfig>(`/stores/${storeId}/weekly-dispatch`);
      const activeIds = new Set(employees.map((member) => member.id));
      const cleaned = emptySchedule();
      for (const day of days) cleaned[day.key] = config.schedule[day.key].filter((id) => activeIds.has(id));
      setSchedule(cleaned); setVersion(config.version);
      dialog.current?.showModal();
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(false); }
  }
  function toggle(day: WeeklyDispatchDay, memberId: string) {
    setSchedule((current) => ({ ...current, [day]: current[day].includes(memberId) ? current[day].filter((id) => id !== memberId) : [...current[day], memberId] }));
  }
  async function save(applyDay = false) {
    if (submitting.current || busy || disabled) return;
    submitting.current = true;
    setBusy(true); setError("");
    try {
      await apiRequest<{ effectiveFrom: string; schedule: WeeklyDispatchSchedule }>(applyDay ? `/stores/${storeId}/boards/${businessDate}/replace-weekly-dispatch` : `/stores/${storeId}/weekly-dispatch`, { method: applyDay ? "POST" : "PUT", idempotent: true, body: { version, schedule } });
      dialog.current?.close();
      await onSaved();
    } catch (caught) { setError(errorMessage(caught)); }
    finally { submitting.current = false; setBusy(false); }
  }

  return <>
    <button className="secondary-action weekly-dispatch-trigger" type="button" disabled={disabled || busy} onClick={() => void open()}>每周排工</button>
    {error && <p className="form-error" role="alert">{error}</p>}
    <dialog ref={dialog} className="board-delivery-dialog weekly-dispatch-dialog" aria-labelledby="weekly-dispatch-title" onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <div className="modal-heading"><div><p className="eyebrow">固定每周名单</p><h2 id="weekly-dispatch-title">每周排工</h2></div><button className="close-button" type="button" disabled={busy} onClick={() => dialog.current?.close()}>取消</button></div>
      <p className="field-help">保存后立即生效，可随时通过营业日日历查看明天的排工。未来日期按最新模板更新，开启每日开门排位时按最新出勤顺序重算；今天已安排的人员和手动调整保持不变。点击“应用”可用当前勾选覆盖当前查看日期的排工（不保存每周模板）；该日期已有记工时应用失败。</p>
      <p className="field-help weekly-dispatch-scroll-hint">左右滑动查看整周。</p>
      <div className="weekly-dispatch-table-wrap"><table className="weekly-dispatch-table"><thead><tr><th scope="col">员工</th>{days.map((day) => <th scope="col" key={day.key}>{day.label}</th>)}</tr></thead><tbody>{employees.map((member) => <tr key={member.id}><th scope="row">{member.displayName}</th>{days.map((day) => <td key={day.key}><label aria-label={`${member.displayName} ${day.label}`}><input type="checkbox" checked={schedule[day.key].includes(member.id)} disabled={busy} onChange={() => toggle(day.key, member.id)} /></label></td>)}</tr>)}</tbody></table></div>
      {employees.length === 0 && <p className="empty-state">目前没有在职的上班人员。</p>}
      {error && <p className="form-error" role="alert">{error}<br /><span>请取消后重新打开，核对最新设置再保存。</span></p>}
      <div className="modal-actions"><button className="secondary-action" type="button" disabled={busy} onClick={() => void save(true)}>应用</button><button className="primary-action" type="button" disabled={busy} onClick={() => void save()}>{busy ? "正在保存…" : "保存每周排工"}</button></div>
    </dialog>
  </>;
}
