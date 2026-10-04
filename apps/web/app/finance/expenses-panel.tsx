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
type Preset = "monthly" | "days" | "months" | "variable" | "once";

export function ExpensesPanel({ storeId, today }: { storeId: string; today: string }) {
  const { locale } = useLanguage();
  const t = (zh: string, en: string) => locale === "en-US" ? en : zh;
  const money = (value: string) => expenseMoney(value, locale);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [result, setResult] = useState<{ scope: string; data: ExpenseMonthResponse } | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [editor, setEditor] = useState<Editor | null>(null);
  const requests = useRef(new LatestRequest()).current;
  const queue = useRef<ReturnType<typeof createRefreshQueue> | null>(null);
  const saving = useRef(false);
  const scope = `${storeId}:${month}`;
  requests.setScope(scope);
  const activeScope = useRef(scope); activeScope.current = scope;
  useEffect(() => {
    setEditor(null); setError("");
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
        if (caught instanceof ApiError && caught.status === 409) { setEditor(null); await refresh?.request(); }
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
  const lineActions = (line: ExpenseMonthLine) => {
    const item = data!.items.find(i => i.id === line.itemId)!;
    return <><button type="button" className="table-action" disabled={busy} onClick={() => setEditor(line.ruleId ? { mode: "period", item, line } : { mode: "edit", item })}>{t("填写 / 修改金额", "Record / edit amount")}</button>
      {line.hasOverride && <button type="button" className="table-action" disabled={busy} onClick={() => { if (window.confirm(t("撤销此期实际金额，恢复默认金额？", "Clear this actual amount and restore the default?"))) run(`/${item.id}/periods`, "DELETE", { version: item.version, ruleId: line.ruleId, periodStart: line.periodStart }); }}>{t("撤销覆盖", "Clear override")}</button>}</>;
  };
  return <section className="finance-section expenses-panel">
    <div className="expenses-filter">
      <div className="expenses-toolbar">
        <label>{t("支出月份", "Expense month")}<input type="month" required value={month} disabled={busy} onChange={e => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value)) setMonth(e.target.value); }} /></label>
        <button type="button" className="secondary-action" disabled={busy} onClick={() => setMonth(today.slice(0, 7))}>{t("本月", "This month")}</button>
        <button type="button" className="primary-action" disabled={busy || loading || !data} onClick={() => setEditor({ mode: "create" })}>{t("新增支出", "Add expense")}</button>
      </div>
      <p className="expenses-description">{t("按自然月计算成本，包含未营业日期；预算会在录入实际账单后替换。", "Costs use calendar months, including non-working days. Actual bills replace budgets.")}</p>
    </div>
    {loading && <p role="status">{t("正在更新支出…", "Updating expenses…")}</p>}
    {error && <p className="form-error" role="alert">{error} <button type="button" className="table-action" disabled={busy} onClick={() => void queue.current?.request()}>{t("刷新", "Refresh")}</button></p>}
    {data && <>
      <div className="expenses-summary">
        <article><span>{t("本月总支出", "Monthly expenses")}</span><strong>{money(data.totalCents)}</strong><small>{data.month}</small></article>
        <article><span>{t("平均每日支出", "Average daily expense")}</span><strong>{money(data.dailyAverageCents)}</strong><small>{t(`月总支出 ÷ ${data.daysInMonth} 天`, `Monthly total ÷ ${data.daysInMonth} days`)}</small></article>
        <article><span>{t("其中预算估算", "Budget included")}</span><strong>{money(data.budgetCents)}</strong><small>{t("未录入账单的浮动费用", "Variable expenses without actual bills")}</small></article>
      </div>
      {data.lines.some(line => line.source === "BUDGET") && <p className="expenses-budget-note">{t("当前结果包含预算估算，请录入实际账单以获得准确成本。", "These totals include estimates. Record actual bills for accurate costs.")}</p>}
      <h2>{t("当月费用明细", "Monthly expense details")}</h2>
      {data.lines.length === 0 ? <p className="empty-state">{t("本月暂无支出。", "No expenses this month.")}</p> : <ResponsiveDataView desktop={<div className="table-scroll"><table className="data-table expenses-table"><thead><tr>
        <th>{t("费用名称", "Expense")}</th><th>{t("周期", "Schedule")}</th><th>{t("覆盖日期", "Coverage")}</th><th>{t("整期金额", "Period amount")}</th><th>{t("本月分摊", "This month")}</th><th>{t("金额来源", "Source")}</th><th>{t("操作", "Actions")}</th>
      </tr></thead><tbody>{data.lines.map(line => {
        const item = data.items.find(i => i.id === line.itemId)!;
        return <tr key={`${line.itemId}:${line.ruleId}:${line.periodStart}`}><td>{line.name}</td><td>{cycleLabel(item, line.ruleId)}</td><td>{line.periodStart}{line.periodEnd !== line.periodStart && ` — ${line.periodEnd}`}</td><td>{money(line.periodAmountCents)}</td><td><strong>{money(line.allocatedCents)}</strong></td><td>{line.source === "BUDGET" ? t("预算估算", "Budget estimate") : line.source === "FIXED" ? t("固定金额", "Fixed amount") : t("实际金额", "Actual amount")}</td><td><span className="table-actions">
          {lineActions(line)}
        </span></td></tr>;
      })}</tbody></table></div>}>
        <ul className="mobile-data-list">{data.lines.map(line => <li key={`${line.itemId}:${line.ruleId}:${line.periodStart}`}><MobileDataCard title={line.name} subtitle={cycleLabel(data.items.find(i => i.id === line.itemId)!, line.ruleId)} status={line.source === "BUDGET" ? t("预算估算", "Budget estimate") : line.source === "FIXED" ? t("固定金额", "Fixed amount") : t("实际金额", "Actual amount")} actions={lineActions(line)}>
          <RecordFacts items={[{ label: t("本月分摊", "This month"), value: money(line.allocatedCents) }, { label: t("整期金额", "Period amount"), value: money(line.periodAmountCents) }, { label: t("覆盖日期", "Coverage"), value: `${line.periodStart}${line.periodEnd !== line.periodStart ? ` — ${line.periodEnd}` : ""}`, wide: true }]} />
        </MobileDataCard></li>)}</ul>
      </ResponsiveDataView>}
      <h2>{t("支出项目管理", "Manage expense items")}</h2>
      <div className="expenses-items">{data.items.filter(i => !i.deletedAt).map(item => {
        const latest = item.rules.at(-1);
        return <article className="expenses-item" key={item.id}><div><h3>{item.name}</h3><p>{cycleLabel(item)}{latest ? ` · ${money(latest.amountCents)} · ${latest.amountMode === "BUDGET" ? t("预算", "Budget") : t("固定", "Fixed")}` : ` · ${item.occurredOn} · ${money(item.amountCents ?? "0")}`}</p>
          {latest && <p>{t("开始", "Starts")} {latest.startDate}{latest.endExclusive && ` · ${t("停止新周期", "No new periods from")} ${latest.endExclusive}`}</p>}{item.note && <p>{item.note}</p>}
          {item.rules.length > 1 && <details><summary>{t("历史规则", "Rule history")}</summary>{item.rules.map(r => <p key={r.id}>{r.startDate} — {r.endExclusive ?? t("持续", "Ongoing")} · {cycleLabel(item, r.id)} · {money(r.amountCents)} · {r.amountMode === "BUDGET" ? t("预算", "Budget") : t("固定", "Fixed")}</p>)}</details>}
        </div><div className="expenses-item-actions">
          <button type="button" className="table-action" disabled={busy} onClick={() => setEditor({ mode: "edit", item })}>{t("编辑", "Edit")}</button>
          {latest && <button type="button" className="table-action" disabled={busy} onClick={() => setEditor({ mode: "rule", item })}>{latest.endExclusive ? t("重新开始", "Resume") : t("变更周期 / 金额", "Change schedule / amount")}</button>}
          {latest && !latest.endExclusive && <button type="button" className="table-action" disabled={busy} onClick={() => setEditor({ mode: "stop", item })}>{t("停止", "Stop")}</button>}
          <button type="button" className="table-action danger" disabled={busy} onClick={() => { if (window.confirm(t("删除会将该项目从所有月份的支出统计中移除，之后可以恢复。确认删除？", "Delete this item from all monthly expense totals? It can be restored later."))) run(`/${item.id}`, "DELETE", { version: item.version }); }}>{t("删除", "Delete")}</button>
        </div></article>;
      })}</div>
      {data.items.some(i => i.deletedAt) && <details className="expenses-deleted"><summary>{t("已删除支出", "Deleted expenses")}</summary>{data.items.filter(i => i.deletedAt).map(item => <div className="expenses-toolbar" key={item.id}><span>{item.name}</span><button type="button" className="table-action" disabled={busy} onClick={() => run(`/${item.id}/restore`, "POST", { version: item.version })}>{t("恢复", "Restore")}</button></div>)}</details>}
    </>}
    {editor && <ExpenseEditor key={`${editor.mode}:${"item" in editor ? editor.item.id : "new"}`} editor={editor} today={today} month={month} busy={busy} save={save} close={() => setEditor(null)} />}
  </section>;
}

function ExpenseEditor({ editor, today, month, busy, save, close }: { editor: Editor; today: string; month: string; busy: boolean; save: (path: string, method: "POST" | "PATCH" | "DELETE", body: unknown) => Promise<void>; close: () => void }) {
  const { locale } = useLanguage(); const t = (zh: string, en: string) => locale === "en-US" ? en : zh;
  const item = "item" in editor ? editor.item : null, latest = item?.rules.at(-1);
  const [name, setName] = useState(item?.name ?? ""), [note, setNote] = useState(item?.note ?? "");
  const [preset, setPreset] = useState<Preset>(item?.kind === "ONCE" ? "once" : latest?.amountMode === "BUDGET" && latest.unit === "MONTH" && latest.interval === 1 ? "variable" : latest?.unit === "DAY" ? "days" : latest?.interval !== undefined && latest.interval > 1 ? "months" : "monthly");
  const [budget, setBudget] = useState(latest?.amountMode === "BUDGET");
  const [interval, setInterval] = useState(String(latest?.interval ?? 1));
  const [amount, setAmount] = useState(expenseInputAmount(editor.mode === "period" ? editor.line.periodAmountCents : item?.amountCents ?? latest?.amountCents ?? "0"));
  const [start, setStart] = useState(latest && (editor.mode === "rule" || editor.mode === "stop") ? nextExpenseStart({ ...latest, amountCents: BigInt(latest.amountCents) }, today) : item?.occurredOn ?? `${month}-01`);
  const [error, setError] = useState("");
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
  const title = editor.mode === "create" ? t("新增支出", "Add expense") : editor.mode === "period" ? t("填写当期实际金额", "Record actual period amount") : editor.mode === "stop" ? t("停止周期支出", "Stop recurring expense") : editor.mode === "rule" ? t("新增生效规则", "New effective rule") : t("编辑支出", "Edit expense");
  const schedule = editor.mode === "create" || editor.mode === "rule";
  const isMonth = preset === "monthly" || preset === "months" || preset === "variable";
  async function submit() {
    setError("");
    try {
      if (editor.mode === "stop") { await save(`/${item!.id}/stop`, "POST", { version: item!.version, effectiveFrom: start }); return; }
      const amountCents = expenseInputCents(amount);
      if (editor.mode === "period") { await save(`/${item!.id}/periods`, "POST", { version: item!.version, ruleId: editor.line.ruleId, periodStart: editor.line.periodStart, amountCents }); return; }
      if (editor.mode === "edit") {
        await save(`/${item!.id}`, "PATCH", { version: item!.version, name, note, ...(item!.kind === "ONCE" ? { amountCents, occurredOn: start } : {}) }); return;
      }
      const rule = { startDate: start, unit: isMonth ? "MONTH" : "DAY", interval: preset === "monthly" || preset === "variable" ? 1 : Number(interval), amountMode: preset === "variable" || budget ? "BUDGET" : "FIXED", amountCents };
      if (editor.mode === "rule") await save(`/${item!.id}/rules`, "POST", { version: item!.version, rule });
      else await save("", "POST", { name, note, ...(preset === "once" ? { kind: "ONCE", occurredOn: start, amountCents } : { kind: "RECURRING", rule }) });
    } catch (caught) { setError(errorMessage(caught)); }
  }
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) close(); }}><form ref={form} className="expenses-editor" role="dialog" aria-modal="true" aria-labelledby="expense-editor-title" onSubmit={e => { e.preventDefault(); if (!busy) void submit(); }}>
    <div className="expenses-toolbar"><h2 id="expense-editor-title">{title}</h2><button type="button" className="close-button" disabled={busy} onClick={close}>{t("关闭", "Close")}</button></div>
    {item && <p>{item.name}</p>}
    {editor.mode === "period" && <p>{editor.line.periodStart} — {editor.line.periodEnd}<br />{t("填写整个周期的实际金额，系统自动重新分摊至对应月份。", "Enter the full period amount. Its monthly allocations update automatically.")}</p>}
    {editor.mode === "rule" && <p>{t("从原规则的周期起点生效，保留此前费用；规则按生效时间依次添加。", "Effective from an existing period boundary; earlier costs remain unchanged. Append changes in chronological order.")}</p>}
    {editor.mode === "stop" && <p>{t("停止日期应为周期起点；已开始的周期保留完整分摊。", "Stop on a period boundary. Periods already started keep their full allocations.")}</p>}
    {(editor.mode === "create" || editor.mode === "edit") && <label>{t("费用名称", "Expense name")}<input required maxLength={100} value={name} disabled={busy} onChange={e => setName(e.target.value)} /></label>}
    {schedule && <label>{t("费用类型", "Expense type")}<select value={preset} disabled={busy} onChange={e => {
      const next = e.target.value as Preset; setPreset(next); setBudget(next === "variable");
      if (["monthly", "months", "variable"].includes(next)) setStart(`${start.slice(0, 7)}-01`);
      else if (editor.mode === "create") setStart(month === today.slice(0, 7) ? today : `${month}-01`);
    }}>
      <option value="monthly">{t("每月固定", "Monthly fixed")}</option><option value="days">{t("每 X 天一次", "Every X days")}</option><option value="months">{t("每 X 个月一次", "Every X months")}</option><option value="variable">{t("每月金额浮动（水电煤气等）", "Monthly variable (utilities)")}</option>{editor.mode === "create" && <option value="once">{t("一次性", "One-time")}</option>}
    </select></label>}
    {schedule && (preset === "days" || preset === "months") && <>
      <label>{preset === "days" ? t("每几天", "Number of days") : t("每几个月", "Number of months")}<input type="number" min={1} max={1200} step={1} required disabled={busy} value={interval} onChange={e => setInterval(e.target.value)} /></label>
      <label className="expenses-checkbox"><input type="checkbox" disabled={busy} checked={budget} onChange={e => setBudget(e.target.checked)} />{t("金额浮动，默认金额作为预算", "Variable amount; use the default as a budget")}</label>
    </>}
    {(schedule || editor.mode === "stop" || (editor.mode === "edit" && item?.kind === "ONCE")) && <label>{editor.mode === "stop" ? t("停止生效日期", "Stop effective date") : editor.mode === "rule" ? t("新规则生效日期", "New rule effective date") : preset === "once" ? t("发生日期", "Expense date") : isMonth ? t("开始月份", "Starting month") : t("开始日期", "Starting date")}
      <input type={isMonth && editor.mode !== "stop" ? "month" : "date"} required disabled={busy} value={isMonth && editor.mode !== "stop" ? start.slice(0, 7) : start} onChange={e => setStart(isMonth && editor.mode !== "stop" ? `${e.target.value}-01` : e.target.value)} />
    </label>}
    {(schedule || editor.mode === "period" || (editor.mode === "edit" && item?.kind === "ONCE")) && <label>{editor.mode === "period" ? t("整期实际金额（美元）", "Actual full-period amount (USD)") : preset === "variable" || budget ? t("整期预算金额（美元）", "Full-period budget (USD)") : t("整期金额（美元）", "Full-period amount (USD)")}<input inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" required disabled={busy} value={amount} onChange={e => setAmount(e.target.value)} /></label>}
    {(editor.mode === "create" || editor.mode === "edit") && <label>{t("备注", "Note")}<textarea maxLength={2000} disabled={busy} value={note} onChange={e => setNote(e.target.value)} /></label>}
    {error && <p className="form-error" role="alert">{error}</p>}
    <button type="submit" className="primary-action" disabled={busy}>{busy ? t("保存中…", "Saving…") : t("保存", "Save")}</button>
  </form></div>;
}
