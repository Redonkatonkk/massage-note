"use client";

import { useEffect, useRef, useState } from "react";
import type { ExpenseItemResponse, ExpenseMonthLine, ExpenseMonthResponse } from "@massage-note/contracts";
import { ApiError, apiRequest, errorMessage } from "../../lib/api";
import { LatestRequest } from "../../lib/latest-request";
import { createRefreshQueue } from "../../lib/refresh-queue";
import { useStoreRealtime } from "../../lib/realtime";
import { useLanguage } from "../language-provider";
import { expenseInputAmount, expenseInputCents, expenseMoney, nextExpenseStart } from "./expense-helpers";
import { MobileDataCard, RecordFacts, ResponsiveDataView } from "../ui/responsive-data-view";

type Editor = { mode: "create" } | { mode: "edit" | "rule" | "stop"; item: ExpenseItemResponse } | { mode: "period"; item: ExpenseItemResponse; line: ExpenseMonthLine };
type Preset = "monthly" | "days" | "months" | "once";

export function ExpensesPanel({ storeId, today }: { storeId: string; today: string }) {
  const { locale } = useLanguage();
  const t = (zh: string, en: string) => locale === "en-US" ? en : zh;
  const money = (value: string | null) => value === null ? t("未录入", "Not recorded") : expenseMoney(value, locale);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [result, setResult] = useState<{ scope: string; data: ExpenseMonthResponse } | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [editor, setEditor] = useState<Editor | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string[]>([]);
  const requests = useRef(new LatestRequest()).current;
  const queue = useRef<ReturnType<typeof createRefreshQueue> | null>(null);
  const saving = useRef(false);
  const scope = `${storeId}:${month}`;
  requests.setScope(scope);
  const activeScope = useRef(scope); activeScope.current = scope;
  useEffect(() => {
    setEditor(null); setDetailsId(null); setExpanded([]); setError("");
    const refresh = createRefreshQueue(async () => {
      const current = requests.begin(); setLoading(true);
      try {
        const data = await apiRequest<ExpenseMonthResponse>(`/stores/${storeId}/expenses?month=${month}`);
        if (current()) { setResult({ scope, data }); setError(""); }
      } catch (caught) { if (current()) { setResult(null); setError(errorMessage(caught)); } }
      finally { if (current()) setLoading(false); }
    });
    queue.current = refresh; void refresh.request();
    return () => { refresh.dispose(); requests.begin(); };
  }, [storeId, month, scope, requests]);
  useStoreRealtime(storeId, change => {
    if (change.full || change.changes.some(c => c.entityType === "expense_item")) return queue.current?.request();
  });
  const data = result?.scope === scope ? result.data : null;
  async function save(path: string, method: "POST" | "PATCH" | "DELETE", body: unknown) {
    if (saving.current) return;
    const submittedScope = scope;
    const refresh = queue.current;
    saving.current = true; setBusy(true); setError("");
    try {
      await apiRequest(`/stores/${storeId}/expenses${path}`, { method, idempotent: true, body });
      if (activeScope.current === submittedScope) { setEditor(null); await refresh?.request(); }
    } catch (caught) {
      if (activeScope.current === submittedScope) {
        if (caught instanceof ApiError && caught.status === 409) { setEditor(null); setDetailsId(null); await refresh?.request(); }
        setError(errorMessage(caught));
      }
      throw caught;
    } finally { saving.current = false; setBusy(false); }
  }
  const run = (path: string, method: "POST" | "PATCH" | "DELETE", body: unknown) => { void save(path, method, body).catch(() => undefined); };
  const cycleLabel = (item: ExpenseItemResponse, ruleId?: string | null) => {
    if (item.kind === "ONCE") return t("一次性", "One-time");
    const rule = item.rules.find(r => r.id === ruleId) ?? item.rules.at(-1);
    return rule ? rule.unit === "MONTH" ? t(`每 ${rule.interval} 个月`, `Every ${rule.interval} month(s)`) : t(`每 ${rule.interval} 天`, `Every ${rule.interval} day(s)`) : "—";
  };
  const itemLines = (item: ExpenseItemResponse) => data!.lines.filter(line => line.itemId === item.id);
  const summary = (item: ExpenseItemResponse) => data!.itemSummaries.find(value => value.itemId === item.id);
  const missing = (count: number) => t(`${count} 期未录入，合计仅含已录入金额`, `${count} period(s) not recorded; totals include recorded amounts only`);
  const lineActions = (item: ExpenseItemResponse, line: ExpenseMonthLine) => <>
    <button type="button" className="table-action" disabled={busy} onClick={() => setEditor({ mode: "period", item, line })}>{t("填写 / 修改金额", "Record / edit amount")}</button>
    {line.hasOverride && <button type="button" className="table-action" disabled={busy} onClick={() => {
      if (window.confirm(t("撤销当期修改？将按常用金额生效日期恢复常用金额或未录入状态。", "Clear this period's change? It will return to the usual amount or not recorded, based on the effective date."))) run(`/${item.id}/periods`, "DELETE", { version: item.version, ruleId: line.ruleId, periodStart: line.periodStart });
    }}>{t("撤销当期修改", "Clear period change")}</button>}
  </>;
  const itemActions = (item: ExpenseItemResponse) => <>
    {item.kind === "ONCE" ? <button type="button" className="table-action" disabled={busy} onClick={() => setEditor({ mode: "edit", item })}>{t("修改金额", "Edit amount")}</button> : <>
      {itemLines(item).length > 0 && <button type="button" className="table-action" aria-expanded={expanded.includes(item.id)} disabled={busy} onClick={() => setExpanded(values => values.includes(item.id) ? values.filter(id => id !== item.id) : [...values, item.id])}>{expanded.includes(item.id) ? t("收起各期", "Hide periods") : t("查看各期", "View periods")}</button>}
      {!item.rules.at(-1)?.endExclusive && <button type="button" className="table-action" disabled={busy} onClick={() => setEditor({ mode: "rule", item })}>{t("修改常用金额 / 周期", "Change usual amount / schedule")}</button>}
    </>}
    <button type="button" className="table-action" disabled={busy} onClick={() => { setError(""); setDetailsId(item.id); }}>{t("项目详情", "Item details")}</button>
  </>;
  const periodRows = (item: ExpenseItemResponse, mobile = false) => mobile ? <ul className="mobile-data-list expenses-periods">{itemLines(item).map(line => <li key={`${line.ruleId}:${line.periodStart}`}><MobileDataCard title={`${line.periodStart} — ${line.periodEnd}`} subtitle={cycleLabel(item, line.ruleId)} actions={lineActions(item, line)}>
    <RecordFacts items={[{ label: t("整期金额", "Full-period amount"), value: money(line.periodAmountCents) }, { label: t("本月分摊", "Monthly allocation"), value: money(line.allocatedCents) }]} />
  </MobileDataCard></li>)}</ul> : <div className="table-scroll expenses-periods"><table className="data-table expenses-period-table"><thead><tr><th>{t("覆盖日期", "Coverage")}</th><th>{t("整期金额", "Full-period amount")}</th><th>{t("本月分摊", "Monthly allocation")}</th><th>{t("操作", "Actions")}</th></tr></thead><tbody>{itemLines(item).map(line => <tr key={`${line.ruleId}:${line.periodStart}`}><td>{line.periodStart} — {line.periodEnd}</td><td>{money(line.periodAmountCents)}</td><td>{money(line.allocatedCents)}</td><td><span className="table-actions">{lineActions(item, line)}</span></td></tr>)}</tbody></table></div>;
  const itemsView = (items: ExpenseItemResponse[], recurring: boolean) => <ResponsiveDataView desktop={<div className="table-scroll"><table className="data-table expenses-table"><thead><tr>
    <th>{t("费用名称", "Expense")}</th><th>{recurring ? t("周期", "Schedule") : t("发生日期", "Expense date")}</th><th>{recurring ? t("本月分摊合计", "Monthly allocation total") : t("金额", "Amount")}</th><th>{t("操作", "Actions")}</th>
  </tr></thead>{items.map(item => {
    const value = summary(item);
    return <tbody key={item.id} data-expense-id={item.id}><tr><td>{item.name}</td><td>{recurring ? cycleLabel(item, itemLines(item).at(-1)?.ruleId) : item.occurredOn}</td><td><strong>{money(value?.allocatedCents ?? null)}</strong>{!!value?.missingPeriodCount && <p className="expenses-description">{missing(value.missingPeriodCount)}</p>}</td><td><span className="table-actions">{itemActions(item)}</span></td></tr>
      {expanded.includes(item.id) && <tr><td colSpan={4}>{periodRows(item)}</td></tr>}
    </tbody>;
  })}</table></div>}><ul className="mobile-data-list">{items.map(item => {
    const value = summary(item);
    return <li key={item.id} data-expense-id={item.id}><MobileDataCard title={item.name} subtitle={recurring ? cycleLabel(item, itemLines(item).at(-1)?.ruleId) : item.occurredOn} actions={itemActions(item)}>
      <RecordFacts items={[{ label: recurring ? t("本月分摊合计", "Monthly allocation total") : t("金额", "Amount"), value: money(value?.allocatedCents ?? null), wide: true }]} />
      {!!value?.missingPeriodCount && <p className="expenses-description">{missing(value.missingPeriodCount)}</p>}
      {expanded.includes(item.id) && periodRows(item, true)}
    </MobileDataCard></li>;
  })}</ul></ResponsiveDataView>;
  const liveItems = data?.items.filter(item => !item.deletedAt) ?? [];
  const once = liveItems.filter(item => item.kind === "ONCE" && summary(item)).sort((a, b) => b.occurredOn!.localeCompare(a.occurredOn!) || a.name.localeCompare(b.name, locale) || a.id.localeCompare(b.id));
  const recurring = liveItems.filter(item => item.kind === "RECURRING").sort((a, b) => a.name.localeCompare(b.name, locale) || a.id.localeCompare(b.id));
  const active = recurring.filter(item => summary(item));
  const inactive = recurring.filter(item => !summary(item));
  const detailItem = data?.items.find(item => item.id === detailsId && !item.deletedAt);
  return <section className="finance-section expenses-panel">
    <div className="expenses-filter">
      <div className="expenses-toolbar">
        <label>{t("支出月份", "Expense month")}<input type="month" required value={month} disabled={busy} onChange={e => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)) setMonth(e.target.value); }} /></label>
        <button type="button" className="secondary-action" disabled={busy} onClick={() => setMonth(today.slice(0, 7))}>{t("本月", "This month")}</button>
        <button type="button" className="primary-action" disabled={busy || loading || !data} onClick={() => setEditor({ mode: "create" })}>{t("新增支出", "Add expense")}</button>
      </div>
      <p className="expenses-description">{t("按自然月分摊周期费用；常用金额每期自动沿用，当期修改覆盖完整周期。", "Recurring costs are allocated by calendar month. Each period uses the usual amount unless you change that full period.")}</p>
    </div>
    {loading && <p role="status">{t("正在更新支出…", "Updating expenses…")}</p>}
    {error && <p className="form-error" role="alert">{error} <button type="button" className="table-action" disabled={busy} onClick={() => void queue.current?.request()}>{t("刷新", "Refresh")}</button></p>}
    {data && <>
      <div className="expenses-summary">
        <article><span>{t("本月总支出", "Monthly total expenses")}</span><strong>{money(data.totalCents)}</strong><small>{data.month}</small></article>
        <article><span>{t("每月固定支出", "Monthly recurring expenses")}</span><strong>{money(data.recurringCents)}</strong><small>{t("全部周期费用的当月分摊", "This month's share of all recurring costs")}</small></article>
        <article><span>{t("本月平均每日支出", "Monthly average daily expense")}</span><strong>{money(data.dailyAverageCents)}</strong><small>{t(`月总支出 ÷ ${data.daysInMonth} 天`, `Monthly total ÷ ${data.daysInMonth} days`)}</small></article>
        <article><span>{t("本月一次性支出", "Monthly one-time expenses")}</span><strong>{money(data.oneTimeCents)}</strong><small>{data.month}</small></article>
      </div>
      {data.missingPeriodCount > 0 && <p className="expenses-missing-note" role="status">{missing(data.missingPeriodCount)}</p>}
      <section className="expenses-region" aria-labelledby="expenses-once-title"><h2 id="expenses-once-title">{t("一次性支出", "One-time expenses")}</h2>
        {once.length ? itemsView(once, false) : <p className="empty-state">{t("本月暂无一次性支出。", "No one-time expenses this month.")}</p>}
      </section>
      <section className="expenses-region" aria-labelledby="expenses-recurring-title"><h2 id="expenses-recurring-title">{t("每月固定支出", "Monthly recurring expenses")}</h2>
        {active.length ? itemsView(active, true) : <p className="empty-state">{t("本月暂无周期费用。", "No recurring costs this month.")}</p>}
        {inactive.length > 0 && <details className="expenses-inactive"><summary>{t("本月未计入的周期项目", "Recurring items outside this month")} ({inactive.length})</summary><div className="expenses-items">{inactive.map(item => <article className="expenses-item" key={item.id} data-expense-id={item.id}><div><h3>{item.name}</h3><p>{cycleLabel(item)} · {t("开始", "Starts")} {item.rules[0]?.startDate}{item.rules.at(-1)?.endExclusive && ` · ${t("停止新周期", "No new periods from")} ${item.rules.at(-1)!.endExclusive}`}</p></div><div className="expenses-item-actions">{itemActions(item)}</div></article>)}</div></details>}
        {data.items.some(item => item.deletedAt) && <details className="expenses-deleted"><summary>{t("已删除支出", "Deleted expenses")}</summary>{data.items.filter(item => item.deletedAt).map(item => <div className="expenses-toolbar" key={item.id} data-expense-id={item.id}><span>{item.name}{item.occurredOn && ` · ${item.occurredOn}`}</span><button type="button" className="table-action" disabled={busy} onClick={() => run(`/${item.id}/restore`, "POST", { version: item.version })}>{t("恢复", "Restore")}</button></div>)}</details>}
      </section>
    </>}
    {detailItem && <ExpenseDialog title={t("项目详情", "Item details")} busy={busy} close={() => setDetailsId(null)}>
      {error && <p className="form-error" role="alert">{error}</p>}
      <h3>{detailItem.name}</h3><p>{detailItem.note || t("暂无备注", "No note")}</p>
      <button type="button" className="table-action" disabled={busy} onClick={() => { setDetailsId(null); setEditor({ mode: "edit", item: detailItem }); }}>{t("编辑名称 / 备注", "Edit name / note")}</button>
      {detailItem.rules.length > 0 && <>
        <h3>{t("规则历史", "Rule history")}</h3>{detailItem.rules.map(rule => <p key={rule.id}>{rule.startDate} — {rule.endExclusive ?? t("持续", "Ongoing")} · {cycleLabel(detailItem, rule.id)}<br />{t("常用金额", "Usual amount")} {money(rule.amountCents)} · {t("自动沿用自", "Applied from")} {rule.defaultAmountFrom}</p>)}
        <button type="button" className="table-action" disabled={busy} onClick={() => { setDetailsId(null); setEditor({ mode: detailItem.rules.at(-1)!.endExclusive ? "rule" : "stop", item: detailItem }); }}>{detailItem.rules.at(-1)!.endExclusive ? t("重新开始", "Resume") : t("停止", "Stop")}</button>
      </>}
      <button type="button" className="table-action danger" disabled={busy} onClick={() => { if (window.confirm(t("删除会将该项目从所有月份的支出统计中移除，之后可以恢复。确认删除？", "Delete this item from all monthly expense totals? It can be restored later."))) run(`/${detailItem.id}`, "DELETE", { version: detailItem.version }); }}>{t("删除", "Delete")}</button>
    </ExpenseDialog>}
    {editor && <ExpenseEditor key={`${editor.mode}:${"item" in editor ? editor.item.id : "new"}`} editor={editor} today={today} month={month} busy={busy} save={save} close={() => setEditor(null)} />}
  </section>;
}

function ExpenseEditor({ editor, today, month, busy, save, close }: { editor: Editor; today: string; month: string; busy: boolean; save: (path: string, method: "POST" | "PATCH" | "DELETE", body: unknown) => Promise<void>; close: () => void }) {
  const { locale } = useLanguage(); const t = (zh: string, en: string) => locale === "en-US" ? en : zh;
  const item = "item" in editor ? editor.item : null, latest = item?.rules.at(-1);
  const [name, setName] = useState(item?.name ?? ""), [note, setNote] = useState(item?.note ?? "");
  const [preset, setPreset] = useState<Preset>(item?.kind === "ONCE" ? "once" : latest?.unit === "DAY" ? "days" : latest?.interval !== undefined && latest.interval > 1 ? "months" : "monthly");
  const [interval, setInterval] = useState(String(latest?.interval ?? 1));
  const [amount, setAmount] = useState(editor.mode === "period" && editor.line.periodAmountCents === null ? "" : expenseInputAmount(editor.mode === "period" ? editor.line.periodAmountCents! : item?.amountCents ?? latest?.amountCents ?? "0"));
  const [start, setStart] = useState(latest && (editor.mode === "rule" || editor.mode === "stop") ? nextExpenseStart({ ...latest, amountCents: BigInt(latest.amountCents) }, today) : item?.occurredOn ?? `${month}-01`);
  const [error, setError] = useState("");
  const title = editor.mode === "create" ? t("新增支出", "Add expense") : editor.mode === "period" ? t("填写 / 修改当期金额", "Record / edit period amount") : editor.mode === "stop" ? t("停止周期支出", "Stop recurring expense") : editor.mode === "rule" ? t("新增生效规则", "New effective rule") : t("编辑支出", "Edit expense");
  const schedule = editor.mode === "create" || editor.mode === "rule";
  const isMonth = preset === "monthly" || preset === "months";
  async function submit() {
    setError("");
    try {
      if (editor.mode === "stop") { await save(`/${item!.id}/stop`, "POST", { version: item!.version, effectiveFrom: start }); return; }
      const amountCents = editor.mode === "edit" && item?.kind === "RECURRING" ? undefined : expenseInputCents(amount);
      if (editor.mode === "period") { await save(`/${item!.id}/periods`, "POST", { version: item!.version, ruleId: editor.line.ruleId, periodStart: editor.line.periodStart, amountCents }); return; }
      if (editor.mode === "edit") {
        await save(`/${item!.id}`, "PATCH", { version: item!.version, name, note, ...(item!.kind === "ONCE" ? { amountCents, occurredOn: start } : {}) }); return;
      }
      const rule = { startDate: start, unit: isMonth ? "MONTH" : "DAY", interval: preset === "monthly" ? 1 : Number(interval), amountCents };
      if (editor.mode === "rule") await save(`/${item!.id}/rules`, "POST", { version: item!.version, rule });
      else await save("", "POST", { name, note, ...(preset === "once" ? { kind: "ONCE", occurredOn: start, amountCents } : { kind: "RECURRING", rule }) });
    } catch (caught) { setError(errorMessage(caught)); }
  }
  return <ExpenseDialog title={title} busy={busy} close={close} onSubmit={() => { void submit(); }}>
    {item && <p>{item.name}</p>}
    {editor.mode === "period" && <p>{editor.line.periodStart} — {editor.line.periodEnd}<br />{t("填写整个周期的金额，修改只影响此期，系统自动重新分摊至对应月份。", "Enter the full-period amount. Only this period changes; its monthly allocations update automatically.")}</p>}
    {editor.mode === "rule" && <p>{t("从原规则的周期起点生效，保留此前费用；规则按生效时间依次添加。", "Effective from an existing period boundary; earlier costs remain unchanged. Append changes in chronological order.")}</p>}
    {editor.mode === "stop" && <p>{t("停止日期应为周期起点；已开始的周期保留完整分摊。", "Stop on a period boundary. Periods already started keep their full allocations.")}</p>}
    {(editor.mode === "create" || editor.mode === "edit") && <label>{t("费用名称", "Expense name")}<input required maxLength={100} value={name} disabled={busy} onChange={e => setName(e.target.value)} /></label>}
    {schedule && <label>{t("费用类型", "Expense type")}<select value={preset} disabled={busy} onChange={e => {
      const next = e.target.value as Preset; setPreset(next);
      if (["monthly", "months"].includes(next)) setStart(`${start.slice(0, 7)}-01`);
      else if (editor.mode === "create") setStart(month === today.slice(0, 7) ? today : `${month}-01`);
    }}>
      <option value="monthly">{t("每月固定", "Monthly fixed")}</option><option value="days">{t("每 X 天一次", "Every X days")}</option><option value="months">{t("每 X 个月一次", "Every X months")}</option>{editor.mode === "create" && <option value="once">{t("一次性", "One-time")}</option>}
    </select></label>}
    {schedule && (preset === "days" || preset === "months") && <>
      <label>{preset === "days" ? t("每几天", "Number of days") : t("每几个月", "Number of months")}<input type="number" min={1} max={1200} step={1} required disabled={busy} value={interval} onChange={e => setInterval(e.target.value)} /></label>
    </>}
    {(schedule || editor.mode === "stop" || (editor.mode === "edit" && item?.kind === "ONCE")) && <label>{editor.mode === "stop" ? t("停止生效日期", "Stop effective date") : editor.mode === "rule" ? t("新规则生效日期", "New rule effective date") : preset === "once" ? t("发生日期", "Expense date") : isMonth ? t("开始月份", "Starting month") : t("开始日期", "Starting date")}
      <input type={isMonth && editor.mode !== "stop" ? "month" : "date"} required disabled={busy} value={isMonth && editor.mode !== "stop" ? start.slice(0, 7) : start} onChange={e => setStart(isMonth && editor.mode !== "stop" ? `${e.target.value}-01` : e.target.value)} />
    </label>}
    {(schedule || editor.mode === "period" || (editor.mode === "edit" && item?.kind === "ONCE")) && <label>{editor.mode === "period" ? t("当期整期金额（美元）", "This full-period amount (USD)") : preset === "once" ? t("金额（美元）", "Amount (USD)") : t("常用整期金额（美元）", "Usual full-period amount (USD)")}<input inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" required disabled={busy} value={amount} onChange={e => setAmount(e.target.value)} /></label>}
    {(editor.mode === "create" || editor.mode === "edit") && <label>{t("备注", "Note")}<textarea maxLength={2000} disabled={busy} value={note} onChange={e => setNote(e.target.value)} /></label>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button type="submit" className="primary-action" disabled={busy}>{busy ? t("保存中…", "Saving…") : t("保存", "Save")}</button>
  </ExpenseDialog>;
}

function ExpenseDialog({ title, busy, close, onSubmit, children }: { title: string; busy: boolean; close: () => void; onSubmit?: () => void; children: import("react").ReactNode }) {
  const { locale } = useLanguage();
  const form = useRef<HTMLFormElement>(null);
  const closeRef = useRef(close); closeRef.current = close;
  const busyRef = useRef(busy); busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    form.current?.querySelector<HTMLElement>("input,button")?.focus();
    function key(event: KeyboardEvent) {
      if (event.key === "Escape" && !busyRef.current) closeRef.current();
      if (event.key !== "Tab") return;
      const nodes = Array.from(form.current?.querySelectorAll<HTMLElement>("button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled)") ?? []);
      const first = nodes[0], last = nodes.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("keydown", key); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) close(); }}><form ref={form} className="expenses-editor" role="dialog" aria-modal="true" aria-labelledby="expense-editor-title" onSubmit={event => { event.preventDefault(); if (!busy) onSubmit?.(); }}>
    <div className="expenses-toolbar"><h2 id="expense-editor-title">{title}</h2><button type="button" className="close-button" disabled={busy} onClick={close}>{locale === "en-US" ? "Close" : "关闭"}</button></div>
    {children}
  </form></div>;
}
