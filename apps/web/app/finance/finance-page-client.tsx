"use client";

import { appHref } from "../../lib/demo-mode";

import { useAutoDismissState } from "../use-auto-dismiss-state";

import { ExpensesPanel } from "./expenses-panel";
import { PayrollLedger } from "./payroll-ledger";
import { FinanceDetailsDialog } from "./finance-details-dialog";
import { AnalyticsPanel } from "./analytics-panel";

import { browserStorage } from "../../lib/browser-storage";

import { useCallback, useEffect, useRef, useState } from "react";
import { LatestRequest } from "../../lib/latest-request";
import { ApiError, apiRequest, errorMessage } from "../../lib/api";
import { hasBlockingClosingWarnings } from "../../lib/closing";
import { formatUsd } from "../../lib/money";
import type {
  CashSettlementResponse,
  CashSettlementRow,
  CatalogResponse,
  ClosingPreview,
  ClosingDeliveryItem,
  ClosingDeliveryList,
  CurrentBusinessDay,
  EmployeeClosingPreview,
  FinanceSummaryResponse,
  FinanceDetailsResponse,
  GiftCardLedgerResponse,
  MeResponse,
  MembershipSummary,
  PayrollSettlement,
  StoreMember,
  StoreDetails,
  WorkRecord,
} from "../../lib/types";
import { useStoreRealtime } from "../../lib/realtime";
import { isWorkRecordChange } from "../../lib/realtime-scope";
import { AppNav } from "../app-nav";
import { ClosingDeliveryQueue } from "../closing-delivery-queue";
import { EmployeeClosingSummary } from "../employee-closing";
import { FloatingAiAssistant } from "../floating-ai-assistant";
import { RecordEditor } from "../record-editor";
import { GiftCardLedger } from "./gift-card-ledger";
import { BusinessDatePicker } from "../business-date-picker";
import { EmployeeSettlementPanel } from "./employee-settlement-panel";
import { CashSettlementDetails, ClosingEmployeeTable } from "./closing-employee-table";
import { PayrollEntryForm } from "./payroll-entry-form";
import { EmployeeSubtotalSection } from "./employee-subtotal-section";
import { dateOnly } from "./date-utils";
import { MonthlySummaryDashboard } from "./monthly-summary-dashboard";
import { monthlyQuery, monthlyRanges } from "./monthly-summary";
import { financeNavigationTabs, resolveFinanceTab, type FinanceTab } from "../../lib/app-navigation";
import { useNavigationTab } from "../use-navigation-tab";
type FinanceRangeOverride = { dateFrom?: string; dateTo?: string; memberIds?: string[] };

function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return formatUsd(cents);
}

export function FinancePageClient() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [membership, setMembership] = useState<MembershipSummary | null>(null);
  const [members, setMembers] = useState<StoreMember[]>([]);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [storeDetails, setStoreDetails] = useState<StoreDetails | null>(null);
  const [day, setDay] = useState<CurrentBusinessDay | null>(null);
  const [tab, setTab] = useState<FinanceTab>("summary");
  const selectTab = useNavigationTab(membership?.role, resolveFinanceTab, setTab);
  const [summary, setSummary] = useState<FinanceSummaryResponse | null>(null);
  const [details, setDetails] = useState<FinanceDetailsResponse | null>(null);
  const [detailsTitle, setDetailsTitle] = useState("财务数据");
  const [loadedCash, setCashData] = useState<CashSettlementResponse | null>(null);
  const [cashLoadFailed, setCashLoadFailed] = useState(false);
  const [closing, setClosing] = useState<ClosingPreview | null>(null);
  const [closingDeliveries, setClosingDeliveries] = useState<ClosingDeliveryList | null>(null);
  const [myClosing, setMyClosing] = useState<EmployeeClosingPreview | null>(null);
  const [payroll, setPayroll] = useState<PayrollSettlement[]>([]);
  const [giftCards, setGiftCards] = useState<GiftCardLedgerResponse | null>(null);
  const [editingRecord, setEditingRecord] = useState<WorkRecord | null>(null);
  const [summaryMonth, setSummaryMonth] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryFailed, setSummaryFailed] = useState(false);
  const [cashDate, setCashDate] = useState("");
  const cashData = loadedCash?.storeId === membership?.store.id && loadedCash?.businessDate === cashDate ? loadedCash : null;
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useAutoDismissState("");
  const [notice, setNotice] = useAutoDismissState("");

  const canManage = membership ? membership.role !== "EMPLOYEE" : false;

  const financeParams = useCallback((override: FinanceRangeOverride = {}) => {
    if (!day || !summaryMonth) return new URLSearchParams();
    const range = monthlyRanges(summaryMonth, day.businessDate);
    const params = monthlyQuery(override.dateFrom ?? range.dateFrom, override.dateTo ?? range.dateTo);
    if (override.memberIds?.length) params.set("membershipIds", override.memberIds.join(","));
    return params;
  }, [summaryMonth, day]);

  const summaryRequests = useRef(new LatestRequest()).current;
  const detailRequests = useRef(new LatestRequest()).current;
  const cashRequests = useRef(new LatestRequest()).current;
  const closingRequests = useRef(new LatestRequest()).current;
  const financeScope = `${membership?.store.id}:${financeParams()}`;
  summaryRequests.setScope(financeScope);
  detailRequests.setScope(financeScope);
  const currentDayScope = `${membership?.store.id}:${cashDate}`;
  const dayScope = useRef(currentDayScope);
  dayScope.current = currentDayScope;
  cashRequests.setScope(currentDayScope);
  closingRequests.setScope(currentDayScope);

  const loadSummary = useCallback(async (override: FinanceRangeOverride = {}, background = false) => {
    if (!membership || !day || !summaryMonth) return;
    const isCurrent = summaryRequests.begin();
    setSummaryLoading(true);
    setSummaryFailed(false);
    try {
      const result = await apiRequest<FinanceSummaryResponse>(
        `/stores/${membership.store.id}/finance/summary?${financeParams(override)}`,
      );
      if (!isCurrent()) return;
      setSummary(result);
      if (!background) setDetails(null);
    } catch (caught) {
      if (!isCurrent()) return;
      setSummary(null);
      setSummaryFailed(true);
      throw caught;
    } finally {
      if (isCurrent()) setSummaryLoading(false);
    }
  }, [membership, day, summaryMonth, financeParams]);

  const currentFinanceParams = useCallback(() => financeParams(), [financeParams]);

  const appliedDetailOverride = useRef<FinanceRangeOverride>({});
  const loadDetails = useCallback(async (override: FinanceRangeOverride = {}) => {
    appliedDetailOverride.current = override;
    if (!membership) return;
    const isCurrent = detailRequests.begin();
    const params = currentFinanceParams();
    if (override.dateFrom) params.set("dateFrom", override.dateFrom);
    if (override.dateTo) params.set("dateTo", override.dateTo);
    if (override.memberIds) {
      params.delete("membershipIds");
      if (override.memberIds.length) params.set("membershipIds", override.memberIds.join(","));
    }
    const result = await apiRequest<FinanceDetailsResponse>(`/stores/${membership.store.id}/finance/details?${params}`);
    if (isCurrent()) setDetails(result);
  }, [membership, currentFinanceParams]);

  const loadCash = useCallback(async () => {
    if (!membership || !cashDate || dayScope.current !== `${membership.store.id}:${cashDate}`) return;
    const isCurrent = cashRequests.begin();
    try {
      const result = await apiRequest<CashSettlementResponse>(`/stores/${membership.store.id}/cash-settlements/${cashDate}`);
      if (isCurrent()) { setCashData(result); setCashLoadFailed(false); }
    } catch (caught) {
      if (isCurrent()) { setCashData(null); setCashLoadFailed(true); throw caught; }
    }
  }, [membership, cashDate]);

  const loadClosing = useCallback(async () => {
    if (!membership || !cashDate || dayScope.current !== `${membership.store.id}:${cashDate}`) return;
    const isCurrent = closingRequests.begin();
    if (canManage) {
      setClosing(null);
      const result = await apiRequest<ClosingPreview>(`/stores/${membership.store.id}/closings/${cashDate}/preview`);
      const deliveries = await apiRequest<ClosingDeliveryList>(`/stores/${membership.store.id}/closings/${cashDate}/deliveries`);
      if (!isCurrent()) return;
      setClosing(result);
      setClosingDeliveries(deliveries);
      setMyClosing(null);
      return;
    }
    setMyClosing(null);
    const personal = await apiRequest<EmployeeClosingPreview>(`/stores/${membership.store.id}/closings/${cashDate}/members/${membership.id}/preview`);
    if (!isCurrent()) return;
    setMyClosing(personal);
    setClosing(null);
  }, [membership, cashDate, canManage]);

  const queueClosingDeliveries = useCallback(async () => {
    if (!membership || !cashDate) return;
    const result = await apiRequest<{ queuedCount: number; skippedCount: number }>(`/stores/${membership.store.id}/closings/${cashDate}/deliveries/batch`, { method: "POST", idempotent: true });
    setClosingDeliveries(await apiRequest<ClosingDeliveryList>(`/stores/${membership.store.id}/closings/${cashDate}/deliveries`));
    setNotice(`已排队 ${result.queuedCount} 位员工${result.skippedCount ? `，跳过 ${result.skippedCount} 位` : ""}`);
  }, [membership, cashDate]);

  const cancelClosingDelivery = useCallback(async (delivery: ClosingDeliveryItem) => {
    if (!membership || !cashDate) return;
    await apiRequest(`/stores/${membership.store.id}/closings/${cashDate}/deliveries/${delivery.id}`, { method: "DELETE" });
    setClosingDeliveries(await apiRequest<ClosingDeliveryList>(`/stores/${membership.store.id}/closings/${cashDate}/deliveries`));
  }, [membership, cashDate]);

  useEffect(() => {
    if (!membership || !canManage || tab !== "closing" || !cashDate) return;
    let cancelled = false;
    const load = () => void apiRequest<ClosingDeliveryList>(`/stores/${membership.store.id}/closings/${cashDate}/deliveries`).then(result => { if (!cancelled) setClosingDeliveries(result); }).catch(() => undefined);
    const timer = window.setInterval(load, 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [membership, canManage, tab, closing?.isClosed, cashDate]);

  const loadPayroll = useCallback(async () => {
    if (!membership) return;
    const includeDeleted = canManage ? "?includeDeleted=true" : "";
    setPayroll(
      await apiRequest<PayrollSettlement[]>(
        `/stores/${membership.store.id}/payroll-settlements${includeDeleted}`,
      ),
    );
  }, [membership, canManage]);

  const loadGiftCards = useCallback(async () => {
    if (!membership || !canManage) return;
    setGiftCards(
      await apiRequest<GiftCardLedgerResponse>(
        `/stores/${membership.store.id}/gift-card-sales`,
      ),
    );
  }, [membership, canManage]);

  const realtimeState = useStoreRealtime(membership?.store.id, async change => {
    if (!change.full && change.changes.length > 0 && change.changes.every(item => item.entityType === "expense_item")) return;
    const workOnly = isWorkRecordChange(change);
    const cashAffected = !workOnly || change.changes.some(item => !item.businessDate || item.businessDate.slice(0, 10) === cashDate);
    await Promise.all([
      loadSummary({}, true),
      ...(details ? [loadDetails(appliedDetailOverride.current)] : []),
      ...(cashAffected ? [loadCash(), loadClosing()] : []),
      // Historical record edits also affect payroll's history-changed indicator.
      loadPayroll(),
      ...(!workOnly ? [loadGiftCards()] : []),
    ]);
  });

  useEffect(() => {
    void (async () => {
      try {
        const profile = await apiRequest<MeResponse>("/me");
        const requestedStore = new URL(window.location.href).searchParams.get("store");
        const selected =
          profile.memberships.find((item) => item.store.id === requestedStore) ??
          profile.memberships.find(
            (item) => item.store.id === browserStorage.getItem("massage_note_store_id"),
          ) ??
          profile.memberships[0];
        if (!selected) {
          window.location.replace(appHref("/"));
          return;
        }
        setMe(profile);
        setMembership(selected);
        const current = await apiRequest<CurrentBusinessDay>(
          `/stores/${selected.store.id}/business-days/current`,
        );
        setDay(current);
        setSummaryMonth(current.businessDate.slice(0, 7));
        const requestedTab = new URL(window.location.href).searchParams.get("tab");
        setTab(resolveFinanceTab(requestedTab, selected.role));
        const requestedDate = new URL(window.location.href).searchParams.get("date");
        setCashDate(
          requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) && requestedDate <= current.businessDate
            ? requestedDate
            : current.businessDate,
        );
        if (selected.role !== "EMPLOYEE") {
          const [nextMembers, nextCatalog, nextStoreDetails] = await Promise.all([
            apiRequest<StoreMember[]>(`/stores/${selected.store.id}/members`),
            apiRequest<CatalogResponse>(`/stores/${selected.store.id}/catalog`),
            apiRequest<StoreDetails>(`/stores/${selected.store.id}`),
          ]);
          setMembers(nextMembers);
          setCatalog(nextCatalog);
          setStoreDetails(nextStoreDetails);
        } else {
          setMembers([
            {
              id: selected.id,
              role: selected.role,
              displayName: selected.displayName,
              isServiceProvider: selected.isServiceProvider,
              employmentType: null,
              status: "ACTIVE",
              version: 1,
              defaultCommissionBps: null,
              closingDeliveryEnabled: false,
              closingDeliveryPhoneE164: null,
              closingImageLocale: null,
              deletedAt: null,
            },
          ]);
        }
      } catch (caught) {
        if ((caught as { status?: number }).status === 401) {
          window.location.replace(appHref("/login"));
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
    void loadPayroll().catch((caught) => setError(errorMessage(caught)));
    void loadGiftCards().catch((caught) => setError(errorMessage(caught)));
  }, [membership]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!membership || !summaryMonth) return;
    void loadSummary().catch(caught => setError(errorMessage(caught)));
  }, [membership, summaryMonth]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!cashDate || !membership) return;
    setCashData(null);
    setCashLoadFailed(false);
    setClosing(null);
    setMyClosing(null);
    setClosingDeliveries(null);
    void loadCash().catch((caught) => setError(errorMessage(caught)));
    void loadClosing().catch((caught) => setError(errorMessage(caught)));
  }, [cashDate, membership, canManage, loadCash, loadClosing]);

  useEffect(() => {
    if (!details && !editingRecord) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDetails(null);
        setEditingRecord(null);
      }
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [details, editingRecord]);

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

  async function mutateCash(action: () => Promise<void>) {
    try {
      await action();
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        await Promise.allSettled([loadCash(), loadClosing(), loadSummary({}, true), loadPayroll()]);
      }
      throw caught;
    }
    await Promise.all([loadCash(), loadClosing(), loadSummary({}, true), loadPayroll()]);
  }

  async function toggleCash(row: CashSettlementRow) {
    const reason = row.status === "SETTLED" ? window.prompt("请填写取消结清原因")?.trim() : undefined;
    if (row.status === "SETTLED" && !reason) return;
    await mutateCash(async () => {
      await apiRequest(`/stores/${membership!.store.id}/cash-settlements/${cashDate}/${row.membershipId}/${row.status === "SETTLED" ? "reopen" : "settle"}`, {
        method: "POST", idempotent: true, body: { version: row.version, dailySettlementEnabled: row.dailySettlementEnabled ?? false, ...(reason ? { reason } : {}) },
      });
    });
  }

  function openWarningRecord(recordId: string) {
    void run(async () => {
      setEditingRecord(
        await apiRequest<WorkRecord>(
          `/stores/${membership!.store.id}/work-records/${recordId}`,
        ),
      );
    });
  }

  if (loading || !membership || !me || !day) {
    if (!loading) return <main className="center-page"><section className="error-card"><h1>暂时无法读取财务数据</h1>{error && <p role="alert">{error}</p>}<button className="primary-action" type="button" onClick={() => window.location.reload()}>重新加载</button></section></main>;
    return <main className="center-page"><div className="loading-card"><span className="spinner" /><strong>正在加载财务数据…</strong></div></main>;
  }

  const financeTabs = financeNavigationTabs(membership.role);
  const pageDescriptions = {
    summary: "按月查看收入、月度对比与员工小计。",
    analytics: "查看营业趋势、服务时段与每周客流分布。",
    expenses: "按月核对固定支出、周期预算与实际账单。",
    closing: canManage ? "逐项核对记工与员工现金，再完成营业日日结。" : "查看自己的当日收入、现金与服务明细。",
    giftCards: "从销售到核销，追踪每张礼物卡的完整记录。",
    payroll: canManage ? "选择员工与日期范围，核对工资后记录支付。" : "查看自己的工资结算与支付明细。",
  };
  const closingHasBlockingWarnings = closing
    ? hasBlockingClosingWarnings(closing.warnings)
    : false;
  const ownerMember = members.find((member) => member.id === storeDetails?.ownerMembershipId);
  const ownerPhone = ownerMember?.user?.phoneE164 ?? ownerMember?.closingDeliveryPhoneE164 ?? "";

  return (
    <main className="app-shell finance-shell">
      <header className="topbar">
        <div><p className="eyebrow">{membership.store.name}</p><h1>{financeTabs.find(([value]) => value === tab)?.[1]}</h1><p className="business-date">{pageDescriptions[tab]} <span className={`sync-status ${realtimeState === "网络已断开" ? "offline" : ""}`}>{realtimeState}</span></p></div>
        <a className="store-switcher header-link" href={appHref("/")}>返回今日记工</a>
      </header>

      <nav className="section-tabs" aria-label="财务页面">
        {financeTabs.map(([value, label]) => (
          <button key={value} className={tab === value ? "active" : ""} type="button" aria-pressed={tab === value} onClick={() => selectTab(value)}>{label}</button>
        ))}
      </nav>
      {notice && <p className="success-banner" role="status">✓ {notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      {tab === "expenses" && canManage && <ExpensesPanel key={membership.store.id} storeId={membership.store.id} today={day.businessDate} />}
      {tab === "analytics" && canManage && <AnalyticsPanel key={membership.store.id} storeId={membership.store.id} today={day.businessDate} />}

      {tab === "summary" && summaryMonth && (
        <MonthlySummaryDashboard
          storeId={membership.store.id}
          today={day.businessDate}
          month={summaryMonth}
          summary={summary}
          loading={summaryLoading}
          failed={summaryFailed}
          busy={busy}
          canViewStoreTrend={canManage}
          onMonthChange={(month) => { setSummaryMonth(month); setDetails(null); }}
          onRetry={() => void run(loadSummary)}
          onViewDetails={(title) => void run(async () => { setDetailsTitle(title); setDetails(null); await loadDetails(); })}
        >
          {summary && <EmployeeSubtotalSection
            storeId={membership.store.id}
            summary={summary}
            ownerPhone={ownerPhone}
            canSend={canManage}
            busy={busy}
            run={run}
            onViewDetails={(selectedMembershipId, label) => void run(async () => { setDetailsTitle(label); setDetails(null); await loadDetails({ memberIds: [selectedMembershipId] }); })}
          />}
        </MonthlySummaryDashboard>
      )}

      {tab === "closing" && canManage && closing?.storeId === membership.store.id && closing.businessDate === cashDate && (
        <section className="finance-section">
          <div className="date-toolbar"><div className="business-date-field"><span>营业日</span><BusinessDatePicker storeId={membership.store.id} value={cashDate} max={day.businessDate} ariaLabel="选择日结营业日" onChange={setCashDate} /></div><button className="secondary-action" type="button" disabled={busy} onClick={() => run(async () => { await Promise.all([loadClosing(), loadCash()]); })}>重新检查</button></div>
          <div className={`closing-status ${closing.hasWarnings ? "warning" : "ready"}`}><div><span>{closing.isClosed ? "已日结" : closingHasBlockingWarnings ? "发现日结异常" : "可以正常日结"}</span><strong>{closing.isClosed ? `第 ${closing.activeClosing?.cycleNo ?? 0} 次日结` : closing.hasWarnings ? `${closing.warningCount} 项提醒` : "检查通过"}</strong></div>{closing.isClosed ? <button className="secondary-action" type="button" disabled={busy} onClick={() => run(async () => { if (!closing.activeClosing) return; await apiRequest(`/stores/${membership.store.id}/closings/${cashDate}/cancel`, { method: "POST", idempotent: true, body: { version: closing.activeClosing.version } }); await loadClosing(); await loadCash(); })}>取消日结</button> : <div className="closing-actions"><button className="primary-action" type="button" disabled={busy || closingHasBlockingWarnings} onClick={() => run(async () => { await apiRequest(`/stores/${membership.store.id}/closings/${cashDate}`, { method: "POST", idempotent: true, body: { force: false } }); await loadClosing(); })}>确认日结</button>{closingHasBlockingWarnings && <button className="danger-button" type="button" disabled={busy} onClick={() => run(async () => { const reason = window.prompt("强制日结会保留全部异常快照，请填写原因"); if (!reason?.trim()) return; await apiRequest(`/stores/${membership.store.id}/closings/${cashDate}`, { method: "POST", idempotent: true, body: { force: true, forceReason: reason.trim() } }); await loadClosing(); })}>强制日结</button>}</div>}</div>
          {closing.warnings.length > 0 && <div className="warning-list">{closing.warnings.map((warning) => <article key={warning.code}><div className="warning-list__heading"><strong>{warning.labelZh}</strong><span>{warning.count} 条记录</span></div>{warning.blocking === false && <p className="warning-list__notice">仅提醒，不影响正常日结</p>}<div className="warning-record-links">{warning.recordIds.map((recordId, index) => <button className="secondary-action compact" key={recordId} type="button" disabled={busy} onClick={() => openWarningRecord(recordId)} aria-label={`查看${warning.labelZh}第 ${index + 1} 单`}>查看第 {index + 1} 单</button>)}</div></article>)}</div>}
          <section className="closing-delivery-panel">
            <div><strong>员工个人日结短信</strong><p>{!closing.isClosed ? "未日结也可从个人日结逐人发送，发送状态显示在下方。" : closingDeliveries?.batchBlockedReason ?? "直接排队所有已开启接收、号码有效且当天有记工的员工。"}</p></div>
            {closing.isClosed && <button className="primary-action" type="button" disabled={busy || closingDeliveries?.batchAllowed === false} onClick={() => run(queueClosingDeliveries)}>{closingDeliveries?.batchAllowed === false ? "仅可逐人补发" : "发送员工小结"}</button>}
            {closingDeliveries && <ClosingDeliveryQueue value={closingDeliveries} busy={busy} onCancel={(delivery) => void run(() => cancelClosingDelivery(delivery))} />}
          </section>
          <h2 className="table-title">全店日结合计</h2><div className="finance-cards closing-totals"><article><span>全部项目数量</span><strong>{closing.storeTotals.itemCount} 项</strong><small>{closing.storeTotals.recordCount} 条记工 · {closing.storeTotals.giftCardSaleCount} 张礼物卡</small></article><article><span>全店大费基数</span><strong>{money(closing.storeTotals.grossFeeBaseCents)}</strong></article><article><span>全店折扣总额</span><strong>{money(closing.storeTotals.discountTotalCents)}</strong></article><article className="balance-card"><span>全店折后大费业绩</span><strong>{money(closing.storeTotals.discountedFeePerformanceCents)}</strong></article><article><span>全店小费总额</span><strong>{money(closing.storeTotals.totalTipCents)}</strong></article><article><span>全店客人总付款</span><strong>{money(closing.storeTotals.customerTotalPaidCents)}</strong><small>含服务、小费和礼物卡销售实收</small></article><article><span>礼物卡销售收入</span><strong>{money(closing.storeTotals.giftCardSalesAmountCents)}</strong><small>{closing.storeTotals.giftCardSaleCount} 张 · 现金 {money(closing.storeTotals.giftCardSaleCashCents)} · 刷卡 {money(closing.storeTotals.giftCardSaleCardCents)}</small></article><article><span>礼物卡核销支出</span><strong>{money(closing.storeTotals.giftCardRedemptionCents)}</strong><small>礼物卡大费＋礼物卡小费</small></article><article className="balance-card"><span>店铺收入</span><strong>{money(closing.storeTotals.storeIncomeCents)}</strong><small>卖卡记收入，核销记支出</small></article></div>
          <ClosingEmployeeTable
            key={`${membership.store.id}-${cashDate}`}
            employees={closing.employees}
            cashRows={cashData?.rows ?? null}
            busy={busy}
            cashLoadFailed={cashLoadFailed}
            onReloadCash={() => void run(loadCash)}
            onSettleAll={() => void run(() => mutateCash(async () => {
              if (!cashData) return;
              await apiRequest(`/stores/${membership.store.id}/cash-settlements/${cashDate}/settle-all`, { method: "POST", idempotent: true, body: { settlements: cashData.rows.map(row => ({ membershipId: row.membershipId, version: row.version, dailySettlementEnabled: row.dailySettlementEnabled ?? false, ...(row.note ? { note: row.note } : {}) })) } });
            }))}
            onToggleCash={row => void run(() => toggleCash(row))}
          />
        </section>
      )}

      {tab === "closing" && !canManage && (
        <section className="finance-section employee-closing-finance-section">
          <div className="date-toolbar"><div className="business-date-field"><span>营业日</span><BusinessDatePicker storeId={membership.store.id} value={cashDate} max={day.businessDate} ariaLabel="选择日结营业日" onChange={setCashDate} /></div><button className="secondary-action" type="button" disabled={busy} onClick={() => run(async () => { await Promise.all([loadClosing(), loadCash()]); })}>重新加载</button></div>
          <section className="personal-cash-settlement">
            <h2 className="table-title">现金结算</h2>
            <p className="field-help">现金未结清不影响正常日结，日结后仍可结清现金。</p>
            {cashData ? cashData.rows.filter(row => row.membershipId === membership.id).map(row => <div key={row.membershipId}>
              <p>{row.status === "SETTLED" ? "已全部结清" : "未结清"}</p>
              <dl className="personal-cash-amounts"><div><dt>应提交店铺</dt><dd>{money(row.cashToSubmitToStoreCents)}</dd></div><div><dt>员工应保留</dt><dd>{money(row.cashRetainedCents)}</dd></div></dl>
              <CashSettlementDetails row={row} />
            </div>) : <p className="field-help">{cashLoadFailed ? "现金结算暂不可用" : "正在加载现金结算…"}{cashLoadFailed && <button className="secondary-action compact" type="button" disabled={busy} onClick={() => void run(loadCash)}>重新加载现金</button>}</p>}
            {cashData?.rows.length === 0 && <p className="empty-state">当日没有记工，无需现金结算。</p>}
          </section>
          <p className="employee-closing-privacy">这里只显示你自己的收入、现金大费和非现金分红，不会加载或展示全店及其他员工日结。</p>
          {myClosing?.storeId === membership.store.id && myClosing.businessDate === cashDate ? <EmployeeClosingSummary key={`${myClosing.businessDate}-${myClosing.employee.membershipId}`} preview={myClosing} /> : <div className="loading-card"><span className="spinner" /><strong>正在加载个人日结…</strong></div>}
        </section>
      )}

      {tab === "giftCards" && canManage && giftCards && (
        <GiftCardLedger ledger={giftCards} />
      )}

      {tab === "payroll" && (
        <PayrollPanel storeId={membership.store.id} businessDate={day.businessDate} canManage={canManage} members={members} settlements={payroll} busy={busy} run={run} reload={async () => { await loadPayroll(); await loadSummary(); }} />
      )}

      {details && <FinanceDetailsDialog details={details} title={detailsTitle} onClose={() => setDetails(null)} />}
      {editingRecord && catalog && storeDetails && (
        <RecordEditor
          storeId={membership.store.id}
          timezone={editingRecord.storeTimezoneSnapshot}
          businessDate={dateOnly(editingRecord.businessDate)}
          autoDiscountSettings={storeDetails}
          record={editingRecord}
          catalog={catalog}
          members={members}
          canManage={canManage}
          isClosed={closing?.isClosed ?? true}
          onClose={() => setEditingRecord(null)}
          onSaved={() => undefined}
          onChanged={async () => {
            await Promise.all([loadSummary(), loadCash(), loadClosing(), loadGiftCards()]);
          }}
        />
      )}
      <AppNav active="finance" storeId={membership.store.id} role={membership.role} activeTab={tab} onTabChange={selectTab} assistant={<FloatingAiAssistant key={`finance-ai-${membership.store.id}`} storeId={membership.store.id} timezone={membership.store.timezone} type="finance" />} />
    </main>
  );
}

function PayrollPanel({ storeId, businessDate, canManage, members, settlements, busy, run, reload }: { storeId: string; businessDate: string; canManage: boolean; members: StoreMember[]; settlements: PayrollSettlement[]; busy: boolean; run: (action: () => Promise<void>) => Promise<void>; reload: () => Promise<void> }) {
  const [editing, setEditing] = useState<PayrollSettlement | null>(null);
  return <section className="finance-section">
    {canManage && <EmployeeSettlementPanel key={storeId} storeId={storeId} businessDate={businessDate} members={members} settlements={settlements} busy={busy} run={run} onSettled={reload} />}
    {canManage && <details className="finance-metric-group finance-metric-disclosure payroll-entry">
      <summary><strong>登记已付工资</strong><span>展开填写</span></summary>
      <PayrollEntryForm storeId={storeId} businessDate={businessDate} members={members} busy={busy} run={run} onSaved={reload} />
    </details>}
    <h2 className="table-title">工资结算账本</h2>
    <PayrollLedger settlements={settlements} canManage={canManage} busy={busy} onEdit={setEditing} onRestore={item => void run(async () => {
      await apiRequest(`/stores/${storeId}/payroll-settlements/${item.id}/restore`, { method: "POST", idempotent: true, body: { version: item.version } });
      await reload();
    })} onDelete={item => void run(async () => {
      if (!window.confirm("确认删除这条工资结算吗？余额会立即重新计算。")) return;
      await apiRequest(`/stores/${storeId}/payroll-settlements/${item.id}`, { method: "DELETE", idempotent: true, body: { version: item.version } });
      await reload();
    })} />
    {editing && <div className="modal-backdrop" role="presentation"><PayrollEntryForm key={editing.id} storeId={storeId} businessDate={businessDate} members={members} settlement={editing} busy={busy} close={() => setEditing(null)} run={run} onSaved={reload} /></div>}
  </section>;
}
