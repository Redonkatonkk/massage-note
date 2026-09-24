"use client";

import { useEffect, useRef, useState } from "react";
import { ApiError, apiRequest, errorMessage } from "../lib/api";
import { createRefreshQueue } from "../lib/refresh-queue";
import { useStoreRealtime } from "../lib/realtime";
import { currentStoreTime, formatWorkTime } from "../lib/time";
import { useLanguage } from "./language-provider";
import { WorkTimeInput } from "./work-time-input";

interface LostCustomer {
  id: string;
  storeId: string;
  businessDate: string;
  occurredTime: string;
  note: string;
  customerCount: number;
  version: number;
}

// The board keys this component by store/date so an old request cannot change a new day's state.
export function LostCustomers({ storeId, businessDate, canEdit }: {
  storeId: string; businessDate: string; canEdit: boolean;
}) {
  const { locale } = useLanguage();
  const t = (zh: string, en: string) => locale === "en-US" ? en : zh;
  const [records, setRecords] = useState<LostCustomer[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<LostCustomer | null | undefined>();
  const [time, setTime] = useState("");
  const [customerCount, setCustomerCount] = useState("1");
  const countValid = /^\d+$/.test(customerCount) && Number(customerCount) >= 1 && Number(customerCount) <= 999;
  const totalCustomers = records.reduce((sum, record) => sum + record.customerCount, 0);
  const [note, setNote] = useState("");
  const [valid, setValid] = useState(false);
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const alive = useRef(false);
  const queue = useRef<ReturnType<typeof createRefreshQueue> | null>(null);
  const path = `/stores/${storeId}/lost-customers`;

  useEffect(() => {
    let active = true;
    alive.current = true;
    const refresh = createRefreshQueue(async () => {
      try {
        const result = await apiRequest<LostCustomer[]>(`${path}?businessDate=${businessDate}`);
        if (active) { setRecords(result); setLoadError(""); }
      } catch (caught) { if (active) setLoadError(errorMessage(caught)); }
      finally { if (active) setLoading(false); }
    });
    queue.current = refresh;
    void refresh.request();
    return () => { active = false; alive.current = false; refresh.dispose(); };
  }, [path, businessDate]);
  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timeout);
  }, [notice]);
  useStoreRealtime(storeId, () => queue.current?.request());

  function open(record: LostCustomer | null) {
    setEditing(record);
    setCustomerCount(String(record?.customerCount ?? 1));
    setNote(record?.note ?? "");
    setTime(record?.occurredTime ?? currentStoreTime(Intl.DateTimeFormat().resolvedOptions().timeZone));
    setValid(true); setError(""); setNotice("");
  }

  async function save(remove = false) {
    if (saving.current || !canEdit || editing === undefined || (!remove && (!valid || !countValid))) return;
    if (remove && (!editing || !window.confirm(t("确认删除这条跑客记录吗？", "Delete this lost customer record?")))) return;
    saving.current = true; setBusy(true); setError(""); setNotice("");
    try {
      await apiRequest(editing ? `${path}/${editing.id}` : path, {
        method: remove ? "DELETE" : editing ? "PATCH" : "POST",
        idempotent: true,
        body: remove ? { version: editing!.version } : editing
          ? { version: editing.version, occurredTime: time, note, customerCount: Number(customerCount) }
          : { businessDate, occurredTime: time, note, customerCount: Number(customerCount) },
      });
      if (!alive.current) return;
      setEditing(undefined);
      setNotice(remove ? t("跑客记录已删除", "Lost customer record deleted") : t("跑客记录已保存", "Lost customer record saved"));
      await queue.current?.request();
    } catch (caught) {
      if (!alive.current) return;
      if (caught instanceof ApiError && caught.status === 409) {
        setEditing(undefined);
        setError(t("记录或营业日状态已变化，请刷新后重新核对。", "The record or business day changed. Refresh and review before trying again."));
        await queue.current?.request();
      } else setError(errorMessage(caught));
    } finally {
      saving.current = false;
      if (alive.current) setBusy(false);
    }
  }

  return <section className="lost-customers" data-empty={!loading && !loadError && records.length === 0} aria-label={t("跑客记录", "Lost customers")}>
    <header className="gift-card-sales__compact-header">
      <div className="lost-customers__heading"><h2>{t("跑客记录", "Lost customers")}</h2><p>{loading ? t("正在加载…", "Loading…") : t(`${totalCustomers} 位 · ${records.length} 条记录`, `${totalCustomers} ${totalCustomers === 1 ? "customer" : "customers"} · ${records.length} ${records.length === 1 ? "record" : "records"}`)}</p></div>
      {canEdit && <button className="secondary-action compact" type="button" disabled={busy || loading || !!loadError} onClick={() => open(null)}>＋ {t("记录跑客", "Record lost customer")}</button>}
    </header>
    {loadError && <p className="form-error" role="alert">{loadError} <button type="button" onClick={() => void queue.current?.request()}>{t("重试", "Retry")}</button></p>}
    {records.length > 0 && <ul className="lost-customers__list">{records.map(record => <li key={record.id}>
      <button type="button" disabled={!canEdit || busy} onClick={() => open(record)} aria-label={t(`修改 ${formatWorkTime(record.occurredTime)} 的跑客记录`, `Edit lost customer at ${formatWorkTime(record.occurredTime)}`)}>
        <time dateTime={`${businessDate}T${record.occurredTime}`}>{formatWorkTime(record.occurredTime)}</time><span>{t(`${record.customerCount} 位`, `${record.customerCount} ${record.customerCount === 1 ? "customer" : "customers"}`)}</span>{record.note && <span className="lost-customers__note">{record.note}</span>}
      </button>
    </li>)}</ul>}
    {editing !== undefined && canEdit && <form className="lost-customers__form" onSubmit={event => { event.preventDefault(); void save(); }}>
      <label htmlFor="lost-customer-time">{t("跑客时间", "Time customer left")}<WorkTimeInput id="lost-customer-time" value={time} onChange={setTime} onValidityChange={setValid} /></label>
      <label htmlFor="lost-customer-count">{t("客人数", "Number of customers")}<input id="lost-customer-count" type="number" inputMode="numeric" min={1} max={999} step={1} required value={customerCount} disabled={busy} onChange={event => setCustomerCount(event.target.value)} /></label>
      <label htmlFor="lost-customer-note">{t("备注（可选）", "Note (optional)")}<textarea id="lost-customer-note" rows={2} maxLength={500} value={note} disabled={busy} onChange={event => setNote(event.target.value)} placeholder={t("例如：等待时间太长", "For example: wait was too long")} /></label>
      <div className="lost-customers__actions">
        <button className="primary-action compact" type="submit" disabled={busy || !valid || !countValid}>{busy ? t("保存中…", "Saving…") : t("保存", "Save")}</button>
        <button className="secondary-action compact" type="button" disabled={busy} onClick={() => setEditing(undefined)}>{t("取消", "Cancel")}</button>
        {editing && <button className="danger-action compact" type="button" disabled={busy} onClick={() => void save(true)}>{t("删除", "Delete")}</button>}
      </div>
    </form>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="success-banner" role="status">{notice}</p>}
  </section>;
}
