"use client";

import { useCallback, useEffect, useState } from "react";
import { apiBase, apiRequest, errorMessage } from "../../lib/api";
import type {
  CashSettlementResponse,
  ClosingPreview,
  CurrentBusinessDay,
  EmployeeClosingPreview,
  FinanceSummaryResponse,
  FinanceDetailsResponse,
  MeResponse,
  MembershipSummary,
  PayrollSettlement,
  StoreMember,
} from "../../lib/types";
import { useStoreRealtime } from "../../lib/realtime";
import { AppNav } from "../app-nav";
import { EmployeeClosingSummary } from "../employee-closing";
import { FloatingAiAssistant } from "../floating-ai-assistant";

type FinanceTab = "summary" | "cash" | "closing" | "payroll";
type FinanceRangeOverride = { dateFrom?: string; dateTo?: string; memberIds?: string[] };

function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
  }).format(cents / 100);
}

function cents(value: string, label: string, signed = false): number {
  const pattern = signed ? /^-?\d+(?:\.\d{0,2})?$/ : /^\d+(?:\.\d{0,2})?$/;
  if (!pattern.test(value.trim())) throw new Error(`${label}格式不正确`);
  return Math.round(Number(value) * 100);
}

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

function payrollMethodText(value: PayrollSettlement["paymentMethod"]): string {
  return ({ CASH: "现金", CARD: "刷卡", CHECK: "支票", ZELLE: "Zelle", OTHER: "其他" } as const)[value];
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function FinancePageClient() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [membership, setMembership] = useState<MembershipSummary | null>(null);
  const [members, setMembers] = useState<StoreMember[]>([]);
  const [day, setDay] = useState<CurrentBusinessDay | null>(null);
  const [tab, setTab] = useState<FinanceTab>("summary");
  const [summary, setSummary] = useState<FinanceSummaryResponse | null>(null);
  const [details, setDetails] = useState<FinanceDetailsResponse | null>(null);
  const [cashData, setCashData] = useState<CashSettlementResponse | null>(null);
  const [closing, setClosing] = useState<ClosingPreview | null>(null);
  const [myClosing, setMyClosing] = useState<EmployeeClosingPreview | null>(null);
  const [payroll, setPayroll] = useState<PayrollSettlement[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cashDate, setCashDate] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("CARD");
  const [amountType, setAmountType] = useState("ALL");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const canManage = membership ? membership.role !== "EMPLOYEE" : false;

  const financeParams = useCallback((override: FinanceRangeOverride = {}) => {
    const params = new URLSearchParams({ paymentMethod, amountType });
    const from = override.dateFrom ?? dateFrom;
    const to = override.dateTo ?? dateTo;
    const selectedMembers = override.memberIds ?? memberIds;
    if (from) params.set("dateFrom", from);
    if (to) params.set("dateTo", to);
    if (selectedMembers.length > 0) params.set("membershipIds", selectedMembers.join(","));
    return params;
  }, [paymentMethod, amountType, dateFrom, dateTo, memberIds]);

  const loadSummary = useCallback(async (override: FinanceRangeOverride = {}) => {
    if (!membership) return;
    const params = financeParams(override);
    const result = await apiRequest<FinanceSummaryResponse>(
      `/stores/${membership.store.id}/finance/summary?${params}`,
    );
    setSummary(result);
    setDetails(null);
    setDateFrom(result.filters.dateFrom);
    setDateTo(result.filters.dateTo);
  }, [membership, financeParams]);

  const currentFinanceParams = useCallback(() => {
    return financeParams();
  }, [financeParams]);

  const loadDetails = useCallback(async (override: FinanceRangeOverride = {}) => {
    if (!membership) return;
    setDetails(await apiRequest<FinanceDetailsResponse>(`/stores/${membership.store.id}/finance/details?${financeParams(override)}`));
  }, [membership, financeParams]);

  const loadCash = useCallback(async () => {
    if (!membership || !cashDate) return;
    setCashData(
      await apiRequest<CashSettlementResponse>(
        `/stores/${membership.store.id}/cash-settlements/${cashDate}`,
      ),
    );
  }, [membership, cashDate]);

  const loadClosing = useCallback(async () => {
    if (!membership || !cashDate) return;
    if (canManage) {
      setClosing(null);
      setClosing(
        await apiRequest<ClosingPreview>(
          `/stores/${membership.store.id}/closings/${cashDate}/preview`,
        ),
      );
      setMyClosing(null);
      return;
    }
    setMyClosing(null);
    setMyClosing(
      await apiRequest<EmployeeClosingPreview>(
        `/stores/${membership.store.id}/closings/${cashDate}/members/${membership.id}/preview`,
      ),
    );
    setClosing(null);
  }, [membership, cashDate, canManage]);

  const loadPayroll = useCallback(async () => {
    if (!membership) return;
    const includeDeleted = canManage ? "?includeDeleted=true" : "";
    setPayroll(
      await apiRequest<PayrollSettlement[]>(
        `/stores/${membership.store.id}/payroll-settlements${includeDeleted}`,
      ),
    );
  }, [membership, canManage]);

  const realtimeState = useStoreRealtime(membership?.store.id, async () => {
    await Promise.all([loadSummary(), loadCash(), loadPayroll(), loadClosing()]);
  });

  useEffect(() => {
    void (async () => {
      try {
        const profile = await apiRequest<MeResponse>("/me");
        const requestedStore = new URL(window.location.href).searchParams.get("store");
        const selected =
          profile.memberships.find((item) => item.store.id === requestedStore) ??
          profile.memberships.find(
            (item) => item.store.id === window.localStorage.getItem("massage_note_store_id"),
          ) ??
          profile.memberships[0];
        if (!selected) {
          window.location.replace("/");
          return;
        }
        setMe(profile);
        setMembership(selected);
        const current = await apiRequest<CurrentBusinessDay>(
          `/stores/${selected.store.id}/business-days/current`,
        );
        setDay(current);
        setCashDate(current.businessDate);
        if (selected.role !== "EMPLOYEE") {
          setMembers(
            await apiRequest<StoreMember[]>(`/stores/${selected.store.id}/members`),
          );
        } else {
          setMembers([
            {
              id: selected.id,
              role: selected.role,
              displayName: selected.displayName,
              isServiceProvider: selected.isServiceProvider,
              status: "ACTIVE",
              version: 1,
              defaultCommissionBps: null,
              deletedAt: null,
            },
          ]);
        }
      } catch (caught) {
        if ((caught as { status?: number }).status === 401) {
          window.location.replace("/login");
          return;
        }
        setError(errorMessage(caught));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!membership) return;
    void loadSummary().catch((caught) => setError(errorMessage(caught)));
    void loadPayroll().catch((caught) => setError(errorMessage(caught)));
  }, [membership]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cashDate || !membership) return;
    void loadCash().catch((caught) => setError(errorMessage(caught)));
    void loadClosing().catch((caught) => setError(errorMessage(caught)));
  }, [cashDate, membership, canManage, loadCash, loadClosing]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  function detailAmount(value: string | number, label: string, override: FinanceRangeOverride) {
    return <button className="amount-link" type="button" aria-label={`${label}，查看组成明细`} onClick={() => void run(() => loadDetails(override))}>{value}</button>;
  }

  if (loading || !membership || !me || !day) {
    return <main className="center-page"><div className="loading-card"><span className="spinner" /><strong>{error || "正在加载财务数据…"}</strong></div></main>;
  }

  return (
    <main className="app-shell finance-shell">
      <header className="topbar">
        <div><p className="eyebrow">{membership.store.name}</p><h1>财务与结算</h1><p className="business-date">数据按店铺营业日和历史快照计算 <span className={`sync-status ${realtimeState === "网络已断开" ? "offline" : ""}`}>{realtimeState}</span></p></div>
        <a className="store-switcher header-link" href="/">返回今日记工</a>
      </header>

      <nav className="section-tabs" aria-label="财务页面">
        {([
          ["summary", "财务汇总"],
          ["cash", "现金结算"],
          ["closing", canManage ? "日结" : "我的日结"],
          ["payroll", canManage ? "工资结算" : "工资结算明细"],
        ] as const).map(([value, label]) => (
          <button key={value} className={tab === value ? "active" : ""} type="button" onClick={() => setTab(value)}>{label}</button>
        ))}
      </nav>
      {error && <p className="form-error" role="alert">{error}</p>}

      {tab === "summary" && summary && (
        <section className="finance-section">
          <form className="filter-panel" onSubmit={(event) => { event.preventDefault(); void run(loadSummary); }}>
            <div className="quick-ranges" aria-label="快捷日期范围"><button type="button" disabled={busy} onClick={() => void run(() => loadSummary({ dateFrom: day.businessDate, dateTo: day.businessDate }))}>今天</button><button type="button" disabled={busy} onClick={() => void run(() => loadSummary({ dateFrom: shiftDate(day.businessDate, -6), dateTo: day.businessDate }))}>最近 7 天</button><button type="button" disabled={busy} onClick={() => void run(() => loadSummary({ dateFrom: `${day.businessDate.slice(0, 8)}01`, dateTo: day.businessDate }))}>本月</button></div>
            <label>开始日期<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
            <label>结束日期<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
            {canManage && <label>员工（可多选）<select multiple value={memberIds} onChange={(event) => setMemberIds([...event.currentTarget.selectedOptions].map((option) => option.value))}>{members.filter((member) => !member.deletedAt).map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label>}
            <label>付款方式<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}><option value="CARD">刷卡</option><option value="CASH">现金</option><option value="ALL">全部</option></select></label>
            <label>金额类型<select value={amountType} onChange={(event) => setAmountType(event.target.value)}><option value="ALL">大费＋小费</option><option value="SERVICE">仅大费</option><option value="TIP">仅小费</option></select></label>
            <div className="filter-actions"><button className="primary-action" type="submit" disabled={busy}>应用筛选</button><a className="secondary-action export-link" href={`${apiBase}/stores/${membership.store.id}/finance/export.csv?${currentFinanceParams()}`} download>导出 CSV</a></div>
          </form>
          <div className="finance-cards">
            <button type="button" onClick={() => void run(loadDetails)}><span>项目数量</span><strong>{summary.totals.recordCount} 单</strong><small>{summary.totals.incompleteRecordCount > 0 ? `${summary.totals.incompleteRecordCount} 单待结账` : "全部已确认"}</small></button>
            <button type="button" onClick={() => void run(loadDetails)}><span>主要项目金额</span><strong>{money(summary.totals.mainServiceAmountCents)}</strong><small>不含额外项目</small></button>
            <button type="button" onClick={() => void run(loadDetails)}><span>额外项目总额</span><strong>{money(summary.totals.addonTotalCents)}</strong><small>全部加项金额</small></button>
            <button type="button" onClick={() => void run(loadDetails)}><span>大费基数</span><strong>{money(summary.totals.grossFeeBaseCents)}</strong><small>主要项目＋额外项目</small></button>
            <button type="button" onClick={() => void run(loadDetails)}><span>折扣总额</span><strong>{money(summary.totals.discountTotalCents)}</strong><small>不降低员工提成工资</small></button>
            <button type="button" onClick={() => void run(loadDetails)}><span>折后大费业绩</span><strong>{money(summary.totals.discountedFeePerformanceCents)}</strong><small>折扣由店铺承担</small></button>
            <button type="button" onClick={() => void run(loadDetails)}><span>实收服务费</span><strong>{money(summary.totals.actualServiceCollectedCents)}</strong><small>现金大费＋刷卡大费</small></button>
            <button type="button" onClick={() => void run(loadDetails)}><span>现金大费</span><strong>{money(summary.totals.cashServiceCents)}</strong><small>客人以现金支付的大费</small></button>
            <button type="button" onClick={() => void run(loadDetails)}><span>刷卡大费</span><strong>{money(summary.totals.cardServiceCents)}</strong><small>客人以刷卡支付的大费</small></button>
            <button type="button" onClick={() => void run(loadDetails)}><span>现金小费</span><strong>{money(summary.totals.cashTipCents)}</strong><small>客人以现金支付的小费</small></button>
            <button type="button" onClick={() => void run(loadDetails)}><span>刷卡小费</span><strong>{money(summary.totals.cardTipCents)}</strong><small>客人以刷卡支付的小费</small></button>
            <button type="button" onClick={() => void run(loadDetails)}><span>小费总额</span><strong>{money(summary.totals.totalTipCents)}</strong><small>现金＋刷卡小费</small></button>
            <button type="button" onClick={() => void run(loadDetails)}><span>客人总付款</span><strong>{money(summary.totals.customerTotalPaidCents)}</strong><small>实收服务费＋小费</small></button>
            <button type="button" onClick={() => void run(loadDetails)}><span>大费工资</span><strong>{money(summary.totals.totalLargeFeeWageCents)}</strong><small>主要项目工资＋加项工资</small></button>
            <button type="button" onClick={() => void run(loadDetails)}><span>员工总收入</span><strong>{money(summary.totals.employeeIncomeCents)}</strong><small>大费工资＋小费</small></button>
            <button type="button" onClick={() => void run(loadDetails)}><span>已通过现金取得</span><strong>{money(summary.totals.settledCashAcquiredWithinRangeCents)}</strong><small>仅计算已结清的现金工资与现金小费</small></button>
            <button className="balance-card" type="button" onClick={() => void run(loadDetails)}><span>老板尚欠</span><strong>{money(summary.totals.employerOwesCents)}</strong><small>{summary.totals.overpaidCents > 0 ? `已超额支付 ${money(summary.totals.overpaidCents)}` : "点击查看记工组成；余额见下方"}</small></button>
            <button type="button" onClick={() => setTab("payroll")}><span>本期工资结算</span><strong>{money(summary.totals.payrollPaidWithinRangeCents)}</strong><small>点击查看工资结算账本</small></button>
          </div>
          {details && <section className="finance-details"><div className="manage-heading"><div><p className="eyebrow">{details.filters.dateFrom} 至 {details.filters.dateTo}</p><h2>组成明细</h2></div><button className="close-button" type="button" onClick={() => setDetails(null)}>收起</button></div><div className="table-scroll"><table className="data-table"><thead><tr><th>营业日</th><th>员工</th><th>项目</th><th>状态</th><th>主要项目</th><th>加项</th><th>大费基数</th><th>折扣</th><th>折后大费</th><th>现金大费</th><th>刷卡大费</th><th>现金小费</th><th>刷卡小费</th><th>客人总付款</th><th>大费工资</th><th>员工总收入</th></tr></thead><tbody>{details.records.map((record) => <tr key={record.id}><td>{dateOnly(record.businessDate)}</td><td>{record.employee.displayName}</td><td>{record.serviceSnapshot?.shortName ?? "自定义"}</td><td>{record.status === "CONFIRMED" ? "已确认" : "待结账"}</td><td>{money(record.mainServiceAmountCents)}</td><td>{money(record.addonTotalCents)}</td><td>{money(record.grossFeeBaseCents)}</td><td>{money(record.discountTotalCents)}</td><td>{money(record.discountedFeePerformanceCents)}</td><td>{money(record.cashServiceCents)}</td><td>{money(record.cardServiceCents)}</td><td>{money(record.cashTipCents)}</td><td>{money(record.cardTipCents)}</td><td>{money(record.customerTotalPaidCents)}</td><td>{money(record.totalLargeFeeWageCents)}</td><td>{money(record.employeeTotalIncomeCents)}</td></tr>)}</tbody></table></div>{details.records.length === 0 && <p className="empty-state">当前范围没有明细记录。</p>}</section>}
          <h2 className="table-title">员工小计</h2>
          <div className="table-scroll"><table className="data-table"><thead><tr><th>员工</th><th>单数</th><th>主要项目</th><th>加项</th><th>大费基数</th><th>折扣</th><th>折后大费</th><th>小费</th><th>大费工资</th><th>总收入</th></tr></thead><tbody>{summary.employees.map((row) => { const scope = { memberIds: [row.membershipId] }; return <tr key={row.membershipId}><td>{row.displayName}</td><td>{detailAmount(row.recordCount, `${row.displayName}项目数量`, scope)}</td><td>{detailAmount(money(row.mainServiceAmountCents), `${row.displayName}主要项目`, scope)}</td><td>{detailAmount(money(row.addonTotalCents), `${row.displayName}额外项目`, scope)}</td><td>{detailAmount(money(row.grossFeeBaseCents), `${row.displayName}大费基数`, scope)}</td><td>{detailAmount(money(row.discountTotalCents), `${row.displayName}折扣`, scope)}</td><td>{detailAmount(money(row.discountedFeePerformanceCents), `${row.displayName}折后大费`, scope)}</td><td>{detailAmount(money(row.totalTipCents), `${row.displayName}小费`, scope)}</td><td>{detailAmount(money(row.totalLargeFeeWageCents), `${row.displayName}大费工资`, scope)}</td><td>{detailAmount(money(row.employeeIncomeCents), `${row.displayName}总收入`, scope)}</td></tr>; })}</tbody></table></div>
          <h2 className="table-title">每日小计</h2>
          <div className="table-scroll"><table className="data-table"><thead><tr><th>营业日</th><th>单数</th><th>主要项目</th><th>加项</th><th>大费基数</th><th>折扣</th><th>折后大费</th><th>实收服务费</th><th>小费</th><th>客人总付款</th><th>员工总收入</th></tr></thead><tbody>{summary.days.map((row) => { const scope = { dateFrom: row.businessDate, dateTo: row.businessDate }; return <tr key={row.businessDate}><td>{row.businessDate}</td><td>{detailAmount(row.recordCount, `${row.businessDate}项目数量`, scope)}</td><td>{detailAmount(money(row.mainServiceAmountCents), `${row.businessDate}主要项目`, scope)}</td><td>{detailAmount(money(row.addonTotalCents), `${row.businessDate}额外项目`, scope)}</td><td>{detailAmount(money(row.grossFeeBaseCents), `${row.businessDate}大费基数`, scope)}</td><td>{detailAmount(money(row.discountTotalCents), `${row.businessDate}折扣`, scope)}</td><td>{detailAmount(money(row.discountedFeePerformanceCents), `${row.businessDate}折后大费`, scope)}</td><td>{detailAmount(money(row.actualServiceCollectedCents), `${row.businessDate}实收服务费`, scope)}</td><td>{detailAmount(money(row.totalTipCents), `${row.businessDate}小费`, scope)}</td><td>{detailAmount(money(row.customerTotalPaidCents), `${row.businessDate}客人总付款`, scope)}</td><td>{detailAmount(money(row.employeeIncomeCents), `${row.businessDate}员工总收入`, scope)}</td></tr>; })}</tbody></table></div>
          <h2 className="table-title">累计余额</h2>
          <div className="balance-list">{summary.balances.map((balance) => <article key={balance.membershipId}><div><strong>{balance.displayName}</strong><span>{balance.excludedOwner ? "店主不进入工资结算" : `累计应得 ${money(balance.cumulativeEmployeeIncomeCents)}`}</span></div>{!balance.excludedOwner && <div className="balance-numbers"><span>现金已取得 {money(balance.settledCashAcquiredCents)}</span><span>工资已支付 {money(balance.payrollPaidCents)}</span><strong>尚欠 {money(balance.employerOwesCents)}</strong>{balance.overpaidCents > 0 && <em>超付 {money(balance.overpaidCents)}</em>}</div>}</article>)}</div>
        </section>
      )}

      {tab === "cash" && cashData && (
        <section className="finance-section">
          <div className="date-toolbar"><label>营业日<input type="date" value={cashDate} max={day.businessDate} onChange={(event) => setCashDate(event.target.value)} /></label>{canManage && cashData.rows.length > 0 && <button className="primary-action" type="button" disabled={busy || cashData.rows.every((row) => row.status === "SETTLED")} onClick={() => run(async () => { await apiRequest(`/stores/${membership.store.id}/cash-settlements/${cashDate}/settle-all`, { method: "POST", idempotent: true, body: { settlements: cashData.rows.map((row) => ({ membershipId: row.membershipId, version: row.version, ...(row.note ? { note: row.note } : {}) })) } }); await loadCash(); await loadSummary(); })}>一键全部结清</button>}</div>
          <p className="field-help">现金结算只记录“未结清/已全部结清”，不记录部分提交，也不把员工应交现金与老板尚欠合并。</p>
          <div className="cash-grid">{cashData.rows.map((row) => <article key={row.membershipId} className={row.status === "SETTLED" ? "settled" : ""}><header><div><strong>{row.displayName}</strong><span>{row.status === "SETTLED" ? "已全部结清" : "未结清"}</span></div><em>{row.status === "SETTLED" ? "已结清" : "待确认"}</em></header><dl><div><dt>现金大费</dt><dd>{money(row.cashServiceCents)}</dd></div><div><dt>现金小费</dt><dd>{money(row.cashTipCents)}</dd></div><div><dt>共收到现金</dt><dd>{money(row.cashReceivedCents)}</dd></div><div><dt>现金对应工资</dt><dd>{money(row.cashAllocatedServiceWageCents)}</dd></div><div><dt>实际取得工资</dt><dd>{money(row.cashAcquiredServiceWageCents)}</dd></div><div><dt>工资缺口</dt><dd>{money(row.cashWageShortfallCents)}</dd></div><div><dt>员工应保留</dt><dd>{money(row.cashRetainedCents)}</dd></div><div><dt>应提交店铺</dt><dd>{money(row.cashToSubmitToStoreCents)}</dd></div></dl><p className="cash-settlement-meta"><span>备注：{row.note || "未填写"}</span><span>结算人：{row.settledByDisplayName || "尚未结算"}</span><span>结算时间：{row.settledAt ? new Date(row.settledAt).toLocaleString("zh-CN") : "尚未结算"}</span></p>{canManage && <button className={row.status === "SETTLED" ? "secondary-action" : "primary-action"} type="button" disabled={busy} onClick={() => run(async () => { if (row.status === "SETTLED") { const reason = window.prompt("请填写取消结清原因"); if (!reason?.trim()) return; await apiRequest(`/stores/${membership.store.id}/cash-settlements/${cashDate}/${row.membershipId}/reopen`, { method: "POST", idempotent: true, body: { version: row.version, reason: reason.trim() } }); } else { const answer = window.prompt("结算备注（可留空）"); if (answer === null) return; const note = answer.trim(); await apiRequest(`/stores/${membership.store.id}/cash-settlements/${cashDate}/${row.membershipId}/settle`, { method: "POST", idempotent: true, body: { version: row.version, ...(note ? { note } : {}) } }); } await loadCash(); await loadSummary(); })}>{row.status === "SETTLED" ? "取消结清" : "标记全部结清"}</button>}</article>)}</div>
        </section>
      )}

      {tab === "closing" && canManage && closing && (
        <section className="finance-section">
          <div className="date-toolbar"><label>营业日<input type="date" value={cashDate} max={day.businessDate} onChange={(event) => setCashDate(event.target.value)} /></label><button className="secondary-action" type="button" disabled={busy} onClick={() => run(loadClosing)}>重新检查</button></div>
          <div className={`closing-status ${closing.hasWarnings ? "warning" : "ready"}`}><div><span>{closing.isClosed ? "已日结" : closing.hasWarnings ? "发现日结异常" : "可以正常日结"}</span><strong>{closing.isClosed ? `第 ${closing.activeClosing?.cycleNo ?? 0} 次日结` : closing.hasWarnings ? `${closing.warningCount} 项提示` : "检查通过"}</strong></div>{closing.isClosed ? <button className="secondary-action" type="button" disabled={busy} onClick={() => run(async () => { const reason = window.prompt("请填写取消日结原因"); if (!reason?.trim() || !closing.activeClosing) return; await apiRequest(`/stores/${membership.store.id}/closings/${cashDate}/cancel`, { method: "POST", idempotent: true, body: { version: closing.activeClosing.version, reason: reason.trim() } }); await loadClosing(); await loadCash(); })}>取消日结</button> : <div className="closing-actions"><button className="primary-action" type="button" disabled={busy || closing.hasWarnings} onClick={() => run(async () => { await apiRequest(`/stores/${membership.store.id}/closings/${cashDate}`, { method: "POST", idempotent: true, body: { force: false } }); await loadClosing(); })}>确认日结</button>{closing.hasWarnings && <button className="danger-button" type="button" disabled={busy} onClick={() => run(async () => { const reason = window.prompt("强制日结会保留全部异常快照，请填写原因"); if (!reason?.trim()) return; await apiRequest(`/stores/${membership.store.id}/closings/${cashDate}`, { method: "POST", idempotent: true, body: { force: true, forceReason: reason.trim() } }); await loadClosing(); })}>强制日结</button>}</div>}</div>
          {closing.warnings.length > 0 && <div className="warning-list">{closing.warnings.map((warning) => <article key={warning.code}><strong>{warning.labelZh}</strong><span>{warning.count} 条记录</span></article>)}</div>}
          <h2 className="table-title">全店日结合计</h2><div className="finance-cards closing-totals"><article><span>全店大费基数</span><strong>{money(closing.storeTotals.grossFeeBaseCents)}</strong></article><article><span>全店折扣总额</span><strong>{money(closing.storeTotals.discountTotalCents)}</strong></article><article className="balance-card"><span>全店折后大费业绩</span><strong>{money(closing.storeTotals.discountedFeePerformanceCents)}</strong></article><article><span>全店小费总额</span><strong>{money(closing.storeTotals.totalTipCents)}</strong></article><article><span>全店客人总付款</span><strong>{money(closing.storeTotals.customerTotalPaidCents)}</strong></article></div>
          <h2 className="table-title">每位员工日结检查</h2><div className="table-scroll"><table className="data-table"><thead><tr><th>员工</th><th>单数</th><th>大费基数</th><th>折扣</th><th>折后大费</th><th>小费</th><th>应得工资</th><th>待结账</th></tr></thead><tbody>{closing.employees.map((row) => <tr key={row.membershipId}><td>{row.displayName}</td><td>{row.recordCount}</td><td>{money(row.grossFeeBaseCents)}</td><td>{money(row.discountTotalCents)}</td><td>{money(row.discountedFeePerformanceCents)}</td><td>{money(row.totalTipCents)}</td><td>{money(row.employeeIncomeCents)}</td><td>{row.incompleteRecordCount}</td></tr>)}</tbody></table></div>
        </section>
      )}

      {tab === "closing" && !canManage && (
        <section className="finance-section employee-closing-finance-section">
          <div className="date-toolbar"><label>营业日<input type="date" value={cashDate} max={day.businessDate} onChange={(event) => setCashDate(event.target.value)} /></label><button className="secondary-action" type="button" disabled={busy} onClick={() => run(loadClosing)}>重新加载</button></div>
          <p className="employee-closing-privacy">这里只显示你自己的记工、折扣、小费和收入，不会加载或展示全店及其他员工日结。</p>
          {myClosing ? <EmployeeClosingSummary key={`${myClosing.businessDate}-${myClosing.employee.membershipId}`} preview={myClosing} /> : <div className="loading-card"><span className="spinner" /><strong>正在加载个人日结…</strong></div>}
        </section>
      )}

      {tab === "payroll" && (
        <PayrollPanel storeId={membership.store.id} businessDate={day.businessDate} canManage={canManage} members={members} settlements={payroll} busy={busy} run={run} reload={async () => { await loadPayroll(); await loadSummary(); }} />
      )}

      <FloatingAiAssistant storeId={membership.store.id} type="finance" />
      <AppNav active="finance" storeId={membership.store.id} />
    </main>
  );
}

function PayrollPanel({ storeId, businessDate, canManage, members, settlements, busy, run, reload }: { storeId: string; businessDate: string; canManage: boolean; members: StoreMember[]; settlements: PayrollSettlement[]; busy: boolean; run: (action: () => Promise<void>) => Promise<void>; reload: () => Promise<void> }) {
  const payable = members.filter((member) => member.role !== "OWNER" && !member.deletedAt);
  const [memberId, setMemberId] = useState(payable[0]?.id ?? "");
  const [settlementDate, setSettlementDate] = useState(businessDate);
  const [periodStart, setPeriodStart] = useState(businessDate);
  const [periodEnd, setPeriodEnd] = useState(businessDate);
  const [serviceWage, setServiceWage] = useState("0.00");
  const [cashTip, setCashTip] = useState("0.00");
  const [cardTip, setCardTip] = useState("0.00");
  const [adjustment, setAdjustment] = useState("0.00");
  const [method, setMethod] = useState("ZELLE");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<PayrollSettlement | null>(null);
  return <section className="finance-section">
    {canManage && <form className="payroll-form" onSubmit={(event) => { event.preventDefault(); void run(async () => { const input = { membershipId: memberId, settlementDate, periodStart, periodEnd, serviceWageCents: cents(serviceWage, "大费工资"), cashTipCents: cents(cashTip, "现金小费"), cardTipCents: cents(cardTip, "刷卡小费"), adjustmentCents: cents(adjustment, "其他调整", true), paymentMethod: method, note }; const total = input.serviceWageCents + input.cashTipCents + input.cardTipCents + input.adjustmentCents; let negativeTotalReason: string | undefined; if (total < 0) { const reason = window.prompt("本次支付总额为负数，请二次确认并填写原因"); if (!reason?.trim()) return; negativeTotalReason = reason.trim(); } await apiRequest(`/stores/${storeId}/payroll-settlements`, { method: "POST", idempotent: true, body: { ...input, ...(negativeTotalReason ? { negativeTotalReason } : {}) } }); setNote(""); await reload(); }); }}><h2>新增工资结算</h2><div className="payroll-fields"><label>员工<select required value={memberId} onChange={(event) => setMemberId(event.target.value)}>{payable.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label><label>结算日期<input type="date" value={settlementDate} onChange={(event) => setSettlementDate(event.target.value)} /></label><label>覆盖开始<input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label><label>覆盖结束<input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label><label>大费工资（美元）<input inputMode="decimal" value={serviceWage} onChange={(event) => setServiceWage(event.target.value)} /></label><label>现金小费（美元）<input inputMode="decimal" value={cashTip} onChange={(event) => setCashTip(event.target.value)} /></label><label>刷卡小费（美元）<input inputMode="decimal" value={cardTip} onChange={(event) => setCardTip(event.target.value)} /></label><label>其他调整（美元）<input inputMode="decimal" value={adjustment} onChange={(event) => setAdjustment(event.target.value)} /></label><label>支付方式<select value={method} onChange={(event) => setMethod(event.target.value)}><option value="ZELLE">Zelle</option><option value="CASH">现金</option><option value="CHECK">支票</option><option value="CARD">刷卡</option><option value="OTHER">其他</option></select></label><label className="wide">备注<input value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} /></label></div><button className="primary-action" type="submit" disabled={busy || !memberId}>保存工资结算</button></form>}
    <h2 className="table-title">工资结算账本</h2><div className="table-scroll"><table className="data-table"><thead><tr><th>员工</th><th>结算日期</th><th>覆盖范围</th><th>大费工资</th><th>现金小费</th><th>刷卡小费</th><th>调整</th><th>本次总额</th><th>方式</th><th>备注</th><th>操作人</th><th>最后修改</th><th>历史状态</th><th>操作</th></tr></thead><tbody>{settlements.map((item) => <tr key={item.id} className={item.deletedAt ? "deleted-row" : ""}><td>{item.membership.displayName}</td><td>{dateOnly(item.settlementDate)}</td><td>{dateOnly(item.periodStart)} 至 {dateOnly(item.periodEnd)}</td><td>{money(item.serviceWageCents)}</td><td>{money(item.cashTipCents)}</td><td>{money(item.cardTipCents)}</td><td>{money(item.adjustmentCents)}</td><td>{money(item.totalPaidCents)}</td><td>{payrollMethodText(item.paymentMethod)}</td><td>{item.note || "—"}</td><td>{item.updatedByDisplayName}</td><td>{new Date(item.updatedAt).toLocaleString("zh-CN")}</td><td>{item.historyChangedAfterSettlement ? <strong className="history-warning">结算后历史数据发生过修改</strong> : "未发现后续修改"}</td><td>{canManage && (item.deletedAt ? <button className="table-action" type="button" onClick={() => void run(async () => { await apiRequest(`/stores/${storeId}/payroll-settlements/${item.id}/restore`, { method: "POST", idempotent: true, body: { version: item.version } }); await reload(); })}>恢复</button> : <span className="table-actions"><button className="table-action" type="button" onClick={() => setEditing(item)}>修改</button><button className="table-action danger" type="button" onClick={() => void run(async () => { if (!window.confirm("确认删除这条工资结算吗？余额会立即重新计算。")) return; const answer = window.prompt("删除原因（可留空）"); if (answer === null) return; const reason = answer.trim(); await apiRequest(`/stores/${storeId}/payroll-settlements/${item.id}`, { method: "DELETE", idempotent: true, body: { version: item.version, ...(reason ? { reason } : {}) } }); await reload(); })}>删除</button></span>)}</td></tr>)}</tbody></table></div>
    {editing && <PayrollEditForm storeId={storeId} settlement={editing} busy={busy} close={() => setEditing(null)} run={run} reload={async () => { setEditing(null); await reload(); }} />}
  </section>;
}

function PayrollEditForm({ storeId, settlement, busy, close, run, reload }: { storeId: string; settlement: PayrollSettlement; busy: boolean; close: () => void; run: (action: () => Promise<void>) => Promise<void>; reload: () => Promise<void> }) {
  const [settlementDate, setSettlementDate] = useState(dateOnly(settlement.settlementDate));
  const [periodStart, setPeriodStart] = useState(dateOnly(settlement.periodStart));
  const [periodEnd, setPeriodEnd] = useState(dateOnly(settlement.periodEnd));
  const [serviceWage, setServiceWage] = useState((settlement.serviceWageCents / 100).toFixed(2));
  const [cashTip, setCashTip] = useState((settlement.cashTipCents / 100).toFixed(2));
  const [cardTip, setCardTip] = useState((settlement.cardTipCents / 100).toFixed(2));
  const [adjustment, setAdjustment] = useState((settlement.adjustmentCents / 100).toFixed(2));
  const [method, setMethod] = useState<PayrollSettlement["paymentMethod"]>(settlement.paymentMethod);
  const [note, setNote] = useState(settlement.note);
  return <div className="modal-backdrop" role="presentation"><form className="payroll-form payroll-edit-modal" role="dialog" aria-modal="true" aria-labelledby="payroll-edit-title" onSubmit={(event) => { event.preventDefault(); void run(async () => { const input = { version: settlement.version, settlementDate, periodStart, periodEnd, serviceWageCents: cents(serviceWage, "大费工资"), cashTipCents: cents(cashTip, "现金小费"), cardTipCents: cents(cardTip, "刷卡小费"), adjustmentCents: cents(adjustment, "其他调整", true), paymentMethod: method, note }; const total = input.serviceWageCents + input.cashTipCents + input.cardTipCents + input.adjustmentCents; let negativeTotalReason: string | undefined; if (total < 0) { const reason = window.prompt("修改后支付总额为负数，请二次确认并填写原因"); if (!reason?.trim()) return; negativeTotalReason = reason.trim(); } await apiRequest(`/stores/${storeId}/payroll-settlements/${settlement.id}`, { method: "PATCH", idempotent: true, body: { ...input, ...(negativeTotalReason ? { negativeTotalReason } : {}) } }); await reload(); }); }}><div className="modal-heading"><div><p className="eyebrow">修改工资结算</p><h2 id="payroll-edit-title">{settlement.membership.displayName}</h2></div><button className="close-button" type="button" onClick={close} disabled={busy}>关闭</button></div><div className="payroll-fields"><label>结算日期<input type="date" value={settlementDate} onChange={(event) => setSettlementDate(event.target.value)} /></label><label>覆盖开始<input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label><label>覆盖结束<input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label><label>大费工资（美元）<input inputMode="decimal" value={serviceWage} onChange={(event) => setServiceWage(event.target.value)} /></label><label>现金小费（美元）<input inputMode="decimal" value={cashTip} onChange={(event) => setCashTip(event.target.value)} /></label><label>刷卡小费（美元）<input inputMode="decimal" value={cardTip} onChange={(event) => setCardTip(event.target.value)} /></label><label>其他调整（美元）<input inputMode="decimal" value={adjustment} onChange={(event) => setAdjustment(event.target.value)} /></label><label>支付方式<select value={method} onChange={(event) => setMethod(event.target.value as PayrollSettlement["paymentMethod"])}><option value="ZELLE">Zelle</option><option value="CASH">现金</option><option value="CHECK">支票</option><option value="CARD">刷卡</option><option value="OTHER">其他</option></select></label><label className="wide">备注<input maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} /></label></div><div className="preview-actions"><button className="primary-action" type="submit" disabled={busy}>保存修改</button><button className="secondary-action" type="button" onClick={close} disabled={busy}>取消</button></div></form></div>;
}
