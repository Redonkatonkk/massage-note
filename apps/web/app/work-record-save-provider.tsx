"use client";

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { createWorkRecordSaveManager, type WorkRecordSaveManager } from "../lib/work-record-saves";
import { useLanguage } from "./language-provider";

const SaveContext = createContext<WorkRecordSaveManager | null>(null);
export const useWorkRecordSaveManager = (): WorkRecordSaveManager | null => useContext(SaveContext);
export function useWorkRecordSaveTasks(manager: WorkRecordSaveManager) {
  return useSyncExternalStore(manager.subscribe, manager.getSnapshot, manager.getSnapshot);
}

export function WorkRecordSaveProvider({ children }: { children: ReactNode }) {
  const [manager] = useState(createWorkRecordSaveManager);
  // Defer disposal by one microtask so React Strict Mode's effect replay keeps the live manager.
  useEffect(() => {
    const token = {};
    lifecycle.set(manager, token);
    return () => {
      queueMicrotask(() => { if (lifecycle.get(manager) === token) manager.dispose(); });
    };
  }, [manager]);
  return <SaveContext.Provider value={manager}>{children}<WorkRecordSaveStatus manager={manager} /></SaveContext.Provider>;
}
const lifecycle = new WeakMap<WorkRecordSaveManager, object>();

function WorkRecordSaveStatus({ manager }: { manager: WorkRecordSaveManager }) {
  const { tasks, recovery } = useWorkRecordSaveTasks(manager);
  const { locale } = useLanguage();
  const t = (zh: string, en: string) => locale === "en-US" ? en : zh;
  const saving = tasks.filter(task => task.status === "saving").length;
  const syncing = tasks.filter(task => task.status === "syncing").length;
  const messages = tasks.filter(task => !["saving", "syncing"].includes(task.status));
  return <>
    {saving + syncing > 0 && <div className="work-save-count" role="status" aria-live="polite" aria-atomic="true">
      {saving > 0 && <span>{t(`正在保存 ${saving} 笔`, `Saving ${saving} ${saving === 1 ? "record" : "records"}`)}</span>}
      {syncing > 0 && <span>{t(`已保存，正在同步 ${syncing} 笔`, `${syncing} saved, syncing`)}</span>}
    </div>}
    {messages.length > 0 && <aside className="work-save-results" aria-label={t("记工保存结果", "Work record save results")}>
      {messages.map(task => <section className={`work-save-result work-save-result--${task.status}`} key={task.id}>
        <strong>{task.storeName} · {task.businessDate} · {task.employeeName}</strong>
        <p role={task.status === "saved" ? "status" : "alert"}>{task.status === "saved" ? t("记工已保存", "Work record saved")
          : task.status === "uncertain" ? t("保存结果待确认。请确认原请求结果后再修改这一笔。", "Save result unconfirmed. Confirm the original request before editing this record.")
          : task.status === "syncFailed" ? t("记工已保存，同步暂时失败。", "Record saved; synchronization failed.") : t("保存失败，填写内容已保留。", "Save failed; your form has been retained.")}</p>
        {task.error && <p>{task.error}</p>}
        {task.status === "failed" && <button type="button" className="secondary-action compact" disabled={recovery === task.id} onClick={() => manager.requestRecovery(task.id)}>
          {recovery === task.id ? t("关闭当前表单后恢复", "Close the current form to restore") : t("恢复填写内容", "Restore form")}</button>}
        {task.status === "uncertain" && <button type="button" className="secondary-action compact" onClick={() => manager.retry(task.id)}>{t("重试确认结果", "Retry to confirm result")}</button>}
        {task.status === "syncFailed" && <button type="button" className="secondary-action compact" onClick={() => manager.retry(task.id)}>{t("重新同步", "Retry synchronization")}</button>}
      </section>)}
    </aside>}
  </>;
}
