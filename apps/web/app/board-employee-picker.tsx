"use client";

import { useRef, useState, type ReactNode } from "react";
import { errorMessage } from "../lib/api";
import type { StoreMember } from "../lib/types";
import { toggleOrderedSelection, addEmployeesInOrder } from "../lib/employee-selection";

interface BoardEmployeePickerProps {
  members: StoreMember[];
  rankingAction?: { label: string; onClick: () => void } | undefined;
  rankingHelp?: ReactNode;
  empty: boolean;
  disabled: boolean;
  onAdd: (membershipId: string) => Promise<void>;
  onReload: () => Promise<void>;
}

export function BoardEmployeePicker({ members, rankingAction, rankingHelp, empty, disabled, onAdd, onReload }: BoardEmployeePickerProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [singleId, setSingleId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function openPicker() {
    setSelected([]);
    setError("");
    dialog.current?.showModal();
  }

  async function submit(ids: string[], batch: boolean) {
    if (submitting.current || disabled || ids.length === 0) return;
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await addEmployeesInOrder(ids, onAdd, (id) => {
        setSelected((current) => current.filter((value) => value !== id));
        setSingleId("");
      });
      if (batch) dialog.current?.close();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      try {
        await onReload();
      } catch (caught) {
        setError(errorMessage(caught));
      }
      submitting.current = false;
      setBusy(false);
    }
  }

  return <>
    {(members.length > 0 || rankingAction) && <section className="add-employee-panel">
      <label className="field-label">手动添加员工到今日表格
        {empty
          ? <button className="employee-picker-trigger" type="button" aria-haspopup="dialog" disabled={busy || disabled} onClick={openPicker}><span>请选择员工</span><span aria-hidden="true">⌄</span></button>
          : <select value={singleId} disabled={busy || disabled} onChange={(event) => setSingleId(event.target.value)}>
            <option value="">请选择员工</option>
            {members.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}
          </select>}
      </label>
      <div className="add-employee-actions">
        <button className="secondary-action" type="button" disabled={busy || disabled || members.length === 0 || (!empty && !singleId)} onClick={() => empty ? openPicker() : void submit([singleId], false)}>添加员工</button>
        {rankingAction && <div className="ranking-action-group"><button className="secondary-action" type="button" disabled={busy || disabled} onClick={rankingAction.onClick}>{rankingAction.label}</button>{rankingHelp}</div>}
      </div>
    </section>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <dialog ref={dialog} className="board-delivery-dialog employee-picker-dialog" aria-labelledby="employee-picker-title" onCancel={(event) => { if (busy) event.preventDefault(); }}>
      <div className="modal-heading">
        <h2 id="employee-picker-title">选择今日上班员工</h2>
        <button className="close-button" type="button" disabled={busy} onClick={() => dialog.current?.close()}>取消</button>
      </div>
      <p className="field-help">按点击顺序排列，取消后重新选择会排到最后。</p>
      <div className="employee-picker-options">
        {members.map((member) => {
          const index = selected.indexOf(member.id);
          return <label key={member.id} className={`employee-picker-option${index >= 0 ? " is-selected" : ""}`}>
            <input type="checkbox" checked={index >= 0} disabled={busy || disabled} onChange={() => setSelected((current) => toggleOrderedSelection(current, member.id))} />
            <span>{member.displayName}</span>
            {index >= 0 && <strong className="employee-picker-order" aria-label="选择顺序">{index + 1}</strong>}
          </label>;
        })}
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="employee-picker-footer">
        <span><span>已选择</span> {selected.length}</span>
        <button className="primary-action" type="button" disabled={busy || disabled || selected.length === 0} onClick={() => void submit(selected, true)}>{busy ? "正在添加…" : "添加所选员工"}</button>
      </div>
    </dialog>
  </>;
}
