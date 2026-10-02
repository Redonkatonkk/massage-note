"use client";

import { useAutoDismissState } from "../use-auto-dismiss-state";

import { ExpensesPanel } from "./expenses-panel";
import { AnalyticsPanel } from "./analytics-panel";

import { browserStorage } from "../../lib/browser-storage";

import { useCallback, useEffect, useRef, useState } from "react";
import { LatestRequest } from "../../lib/latest-request";
import { ApiError, apiBase, apiRequest, errorMessage } from "../../lib/api";
import { hasBlockingClosingWarnings } from "../../lib/closing";
import { formatUsd, formatUsdPrecise } from "../../lib/money";
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
import { useLanguage } from "../language-provider";
import { RecordEditor } from "../record-editor";
import { GiftCardLedger } from "./gift-card-ledger";
import { BusinessDatePicker } from "../business-date-picker";
import { EmployeeSettlementPanel } from "./employee-settlement-panel";
import { CashSettlementDetails, ClosingEmployeeTable } from "./closing-employee-table";
import { PayrollEntryForm } from "./payroll-entry-form";
import { EmployeeSubtotalSection } from "./employee-subtotal-section";
import { dateOnly, shiftDate } from "./date-utils";
import { financeNavigationTabs, resolveFinanceTab, type FinanceTab } from "../../lib/app-navigation";
import { useNavigationTab } from "../use-navigation-tab";
import {
  financeSummaryGroups,
  financeSummaryMetrics,
  type FinanceSummaryMetricKey,
} from "./summary-metrics";

type FinanceRangeOverride = { dateFrom?: string; dateTo?: string; memberIds?: string[] };

function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return formatUsd(cents);
}

function weekday(value: string, locale: "zh-CN" | "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00.000Z`));
}

function FinanceSummaryCard({
  label,
  value,
  caption,
  explanation,
  calculation,
  onViewDetails,
}: {
  label: string;
  value: string;
  caption: string;
  explanation: string;
  calculation: string;
  onViewDetails: () => void;
}) {
  return (
    <article className="finance-summary-card">
      <button className="finance-summary-card__main" type="button" onClick={onViewDetails} aria-label={`${label}：${value}，查看组成明细`}>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{caption}</small>
      </button>
      <details className="finance-summary-info">
        <summary aria-label={`查看“${label}”的解释和计算方法`}>说明</summary>
        <div className="finance-summary-tooltip" role="tooltip">
          <strong>{label}</strong>
          <span>词条解释</span>
          <p>{explanation}</p>
          <span>计算方法</span>
          <p>{calculation}</p>
        </div>
      </details>
    </article>
  );
}

function FinanceDetailsDialog({
  details,
  title,
  onClose,
}: {
  details: FinanceDetailsResponse;
  title: string;
  onClose: () => void;
}) {
  const selectedScope = details.filters.paymentMethod === "CASH" ? "现金" : details.filters.paymentMethod === "NON_CASH" ? "刷卡＋礼物卡" : "全部付款";
  return (
    <div className="finance-details-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="finance-details" role="dialog" aria-modal="true" aria-labelledby="finance-details-title">
        <div className="finance-details__heading">
          <div>
            <p className="eyebrow">{details.filters.dateFrom} 至 {details.filters.dateTo}</p>
            <h2 id="finance-details-title">{title} · 组成明细</h2>
            <p>{details.records.length} 条记工，{details.giftCardSales.length} 张礼物卡销售；员工收入仅计算“{selectedScope}”对应部分。</p>
          </div>
          <button className="close-button" type="button" onClick={onClose}>关闭</button>
        </div>
        <div className="table-scroll finance-details__table"><table className="data-table"><thead><tr><th>营业日</th><th>员工</th><th>项目</th><th>标记</th><th>状态</th><th>主要项目</th><th>加项</th><th>大费基数</th><th>折扣</th><th>折后大费</th><th>现金大费</th><th>刷卡大费</th><th>礼物卡序列号</th><th>礼物卡大费</th><th>现金小费</th><th>刷卡小费</th><th>礼物卡小费</th><th>客人总付款</th><th>所选大费工资</th><th>所选小费</th><th>所选员工收入</th></tr></thead><tbody>{details.records.map((record) => <tr className={record.isHighlighted ? "finance-record--highlighted" : undefined} key={record.id}><td>{dateOnly(record.businessDate)}</td><td>{record.employee.displayName}</td><td>{record.serviceSnapshot?.shortName ?? "自定义"}</td><td><span className="finance-record-labels">{record.isHighlighted && <span className="finance-highlight-label">★ 高亮</span>}{record.hasCashAndNonCashPayment && details.filters.paymentMethod !== "ALL" && <span className="finance-payment-label">混合付款 · 仅计{selectedScope}</span>}{!record.isHighlighted && (!record.hasCashAndNonCashPayment || details.filters.paymentMethod === "ALL") && "—"}</span></td><td>{record.status === "CONFIRMED" ? "已确认" : "待结账"}</td><td>{money(record.mainServiceAmountCents)}</td><td>{money(record.addonTotalCents)}</td><td>{money(record.grossFeeBaseCents)}</td><td>{money(record.discountTotalCents)}</td><td>{money(record.discountedFeePerformanceCents)}</td><td>{money(record.cashServiceCents)}</td><td>{money(record.cardServiceCents)}</td><td>{record.giftCardSerialNumber ?? "—"}</td><td>{money(record.giftCardServiceCents)}</td><td>{money(record.cashTipCents)}</td><td>{money(record.cardTipCents)}</td><td>{money(record.giftCardTipCents)}</td><td>{money(record.customerTotalPaidCents)}</td><td>{money(record.selectedLargeFeeWageCents)}</td><td>{money(record.selectedTipCents)}</td><td><strong>{money(record.selectedEmployeeIncomeCents)}</strong></td></tr>)}</tbody></table></div>
        {details.giftCardSales.length > 0 && <><h3 className="table-title">礼物卡销售明细</h3><div className="table-scroll finance-details__table"><table className="data-table"><thead><tr><th>营业日</th><th>序列号</th><th>面值</th><th>折扣</th><th>现金收款</th><th>刷卡收款</th><th>实际收款</th><th>操作人</th></tr></thead><tbody>{details.giftCardSales.map((sale) => <tr key={sale.id}><td>{dateOnly(sale.businessDate)}</td><td>{sale.serialNumber}</td><td>{money(sale.faceValueCents)}</td><td>{money(sale.discountCents)}</td><td>{money(sale.cashCents)}</td><td>{money(sale.cardCents)}</td><td>{money(sale.amountCents)}</td><td>{sale.operator.displayName}</td></tr>)}</tbody></table></div></>}
        {details.records.length === 0 && details.giftCardSales.length === 0 && <p className="empty-state">当前范围没有明细记录。</p>}
      </section>
    </div>
  );
}

export function FinancePageClient() {
  const { locale } = useLanguage();
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
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cashDate, setCashDate] = useState("");
  const cashData = loadedCash?.storeId === membership?.store.id && loadedCash?.businessDate === cashDate ? loadedCash : null;
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<FinanceSummaryResponse["filters"]["paymentMethod"]>("ALL");
  const [amountType, setAmountType] = useState("ALL");
  const [highlightFilter, setHighlightFilter] = useState<FinanceSummaryResponse["filters"]["highlightFilter"]>("ALL");
  const [busy, setBusy] = useState(false);
  const [showDailyColumns, setShowDailyColumns] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useAutoDismissState("");
  const [notice, setNotice] = useAutoDismissState("");

  const canManage = membership ? membership.role !== "EMPLOYEE" : false;

  const financeParams = useCallback((override: FinanceRangeOverride = {}) => {
    const params = new URLSearchParams({ paymentMethod, amountType, highlightFilter });
    const from = override.dateFrom ?? dateFrom;
    const to = override.dateTo ?? dateTo;
    const selectedMembers = override.memberIds ?? memberIds;
    if (from) params.set("dateFrom", from);
    if (to) params.set("dateTo", to);
    if (selectedMembers.length > 0) params.set("membershipIds", selectedMembers.join(","));
    return params;
  }, [paymentMethod, amountType, highlightFilter, dateFrom, dateTo, memberIds]);

  const appliedFinanceQuery = useRef<string | null>(null);
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
    if (!membership) return;
    const isCurrent = summaryRequests.begin();
    const params = background && appliedFinanceQuery.current ? new URLSearchParams(appliedFinanceQuery.current) : financeParams(override);
    const result = await apiRequest<FinanceSummaryResponse>(
      `/stores/${membership.store.id}/finance/summary?${params}`,
    );
    if (!isCurrent()) return;
    params.set("dateFrom", result.filters.dateFrom);
    params.set("dateTo", result.filters.dateTo);
    appliedFinanceQuery.current = params.toString();
    setSummary(result);
    if (!background) setDetails(null);
    if (!background || !dateFrom || !dateTo) {
      setDateFrom(result.filters.dateFrom);
      setDateTo(result.filters.dateTo);
    }
  }, [membership, financeParams]);

  const currentFinanceParams = useCallback(() => {
    return new URLSearchParams(appliedFinanceQuery.current ?? financeParams().toString());
  }, [financeParams, summary]);

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
          window.location.replace("/");
          return;
        }
        setMe(profile);
        setMembership(selected);
        const current = await apiRequest<CurrentBusinessDay>(
          `/stores/${selected.store.id}/business-days/current`,
        );
        setDay(current);
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
    void loadGiftCards().catch((caught) => setError(errorMessage(caught)));
  }, [membership]); // eslint-disable-line react-hooks/exhaustive-deps

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

  function detailAmount(value: string | number, label: string, override: FinanceRangeOverride) {
    return <button className="amount-link" type="button" aria-label={`${label}，查看组成明细`} onClick={() => void run(async () => { setDetailsTitle(label); setDetails(null); await loadDetails(override); })}>{value}</button>;
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
  const closingHasBlockingWarnings = closing
    ? hasBlockingClosingWarnings(closing.warnings)
    : false;
  const ownerMember = members.find((member) => member.id === storeDetails?.ownerMembershipId);
  const ownerPhone = ownerMember?.user?.phoneE164 ?? ownerMember?.closingDeliveryPhoneE164 ?? "";

  return (
    <main className="app-shell finance-shell">
      <header className="topbar">
        <div><p className="eyebrow">{membership.store.name}</p><h1>财务与结算</h1><p className="business-date">数据按店铺营业日和历史快照计算 <span className={`sync-status ${realtimeState === "网络已断开" ? "offline" : ""}`}>{realtimeState}</span></p></div>
        <a className="store-switcher header-link" href="/">返回今日记工</a>
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

      {tab === "summary" && summary && (
        <section className="finance-section">
          <form className="filter-panel" onSubmit={(event) => { event.preventDefault(); void run(loadSummary); }}>
            <div className="filter-panel__heading"><div><strong>筛选范围</strong><p>选好日期，即可查看收入与结算。</p></div><a className="secondary-action export-link" href={`${apiBase}/stores/${membership.store.id}/finance/export.csv?${currentFinanceParams()}`} download>导出当前结果</a></div>
            <div className="quick-ranges" aria-label="快捷日期范围"><button type="button" disabled={busy} onClick={() => void run(() => loadSummary({ dateFrom: day.businessDate, dateTo: day.businessDate }))}>今天</button><button type="button" disabled={busy} onClick={() => void run(() => loadSummary({ dateFrom: shiftDate(day.businessDate, -6), dateTo: day.businessDate }))}>最近 7 天</button><button type="button" disabled={busy} onClick={() => void run(() => loadSummary({ dateFrom: `${day.businessDate.slice(0, 8)}01`, dateTo: day.businessDate }))}>本月</button></div>
            <label>开始日期<input type="date" required max={dateTo || day.businessDate} value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
            <label>结束日期<input type="date" required min={dateFrom} max={day.businessDate} value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
            <details className="finance-advanced-filters">
              <summary>更多筛选<span>{memberIds.length > 0 || paymentMethod !== "ALL" || amountType !== "ALL" || highlightFilter !== "ALL" ? "已限定条件" : "员工、付款、金额、高亮"}</span></summary>
              <div className="finance-advanced-filters__body">
            {canManage && (
              <fieldset className="finance-member-filter">
                <legend>选择员工</legend>
                <div className="finance-member-filter__heading">
                  <span>{memberIds.length === 0 ? "全部员工" : `已选 ${memberIds.length} 人`}</span>
                  {memberIds.length > 0 && <button type="button" onClick={() => setMemberIds([])}>清除</button>}
                </div>
                <div className="finance-member-filter__options">
                  <label className="finance-member-filter__all">
                    <input type="checkbox" checked={memberIds.length === 0} onChange={() => setMemberIds([])} />
                    <span>全部员工</span>
                  </label>
                  {members.filter((member) => !member.deletedAt).map((member) => (
                    <label key={member.id}>
                      <input
                        type="checkbox"
                        checked={memberIds.includes(member.id)}
                        onChange={(event) => setMemberIds((current) => event.target.checked
                          ? [...current, member.id]
                          : current.filter((id) => id !== member.id))}
                      />
                      <span>{member.displayName}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <label>付款方式<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as FinanceSummaryResponse["filters"]["paymentMethod"])}><option value="ALL">全部</option><option value="CASH">现金</option><option value="NON_CASH">刷卡＋礼物卡</option></select></label>
            <label>金额类型<select value={amountType} onChange={(event) => setAmountType(event.target.value)}><option value="ALL">大费＋小费</option><option value="SERVICE">仅大费</option><option value="TIP">仅小费</option></select></label>
            <label>高亮记工<select value={highlightFilter} onChange={(event) => setHighlightFilter(event.target.value as FinanceSummaryResponse["filters"]["highlightFilter"])}><option value="ALL">查看所有记工</option><option value="ONLY_HIGHLIGHTED">仅查看高亮记工</option><option value="EXCLUDE_HIGHLIGHTED">排除高亮记工</option></select></label>
              </div>
            </details>
            <div className="filter-actions"><button className="primary-action" type="submit" disabled={busy}>查看结果</button></div>
          </form>
          <p className="finance-result-scope" role="status">当前结果：{summary.filters.dateFrom} 至 {summary.filters.dateTo}</p>
          {(() => {
              const values: Record<FinanceSummaryMetricKey, { value: string; caption: string }> = {
                averageRevenueCents: { value: summary.totals.averageRevenueCents === null ? "—" : money(summary.totals.averageRevenueCents), caption: summary.totals.averageRevenueDayCount > 0 ? `按 ${summary.totals.averageRevenueDayCount} 个已日结日计算（折扣后）` : "所选范围暂无已日结日期" },
                itemCount: { value: `${summary.totals.itemCount} 项`, caption: `${summary.totals.recordCount} 条记工＋${summary.totals.giftCardSaleCount} 张礼物卡` },
                mainServiceAmountCents: { value: money(summary.totals.mainServiceAmountCents), caption: "不含额外项目" },
                addonTotalCents: { value: money(summary.totals.addonTotalCents), caption: "全部加项金额" },
                grossFeeBaseCents: { value: money(summary.totals.grossFeeBaseCents), caption: "主要项目＋额外项目" },
                discountTotalCents: { value: money(summary.totals.discountTotalCents), caption: "不降低员工提成工资" },
                discountedFeePerformanceCents: { value: money(summary.totals.discountedFeePerformanceCents), caption: "折扣由店铺承担" },
                totalTurnoverCents: { value: money(summary.totals.totalTurnoverCents), caption: "折后大费＋礼物卡销售－礼物卡核销支出" },
                actualServiceCollectedCents: { value: money(summary.totals.actualServiceCollectedCents), caption: "现金＋刷卡＋礼物卡大费" },
                cashServiceCents: { value: money(summary.totals.cashServiceCents), caption: "客人以现金支付的大费" },
                cardServiceCents: { value: money(summary.totals.cardServiceCents), caption: "客人以刷卡支付的大费" },
                giftCardServiceCents: { value: money(summary.totals.giftCardServiceCents), caption: "客人以礼物卡支付的大费" },
                cashTipCents: { value: money(summary.totals.cashTipCents), caption: "客人以现金支付的小费" },
                cardTipCents: { value: money(summary.totals.cardTipCents), caption: "客人以刷卡支付的小费" },
                giftCardTipCents: { value: money(summary.totals.giftCardTipCents), caption: "客人以礼物卡支付的小费" },
                totalTipCents: { value: money(summary.totals.totalTipCents), caption: "现金＋刷卡＋礼物卡小费" },
                giftCardSaleCashCents: { value: money(summary.totals.giftCardSaleCashCents), caption: "不进入员工现金结算" },
                giftCardSaleCardCents: { value: money(summary.totals.giftCardSaleCardCents), caption: "卖卡刷卡实收" },
                giftCardSalesAmountCents: { value: money(summary.totals.giftCardSalesAmountCents), caption: `${summary.totals.giftCardSaleCount} 张，全部计入店铺收入` },
                giftCardRedemptionCents: { value: money(summary.totals.giftCardRedemptionCents), caption: "礼物卡大费＋礼物卡小费" },
                storeIncomeCents: { value: money(summary.totals.storeIncomeCents), caption: "卖卡记收入，核销记支出" },
                ownerWorkerIncomeCents: { value: money(summary.totals.ownerWorkerIncomeCents), caption: "店长作为工人的收入" },
                managerWorkerIncomeCents: { value: money(summary.totals.managerWorkerIncomeCents), caption: "所有经理作为工人的收入" },
                giftCardNetIncomeCents: { value: money(summary.totals.giftCardNetIncomeCents), caption: "礼物卡销售－礼物卡核销支出" },
                creditCardFeeCents: { value: money(summary.totals.creditCardFeeCents), caption: "普通刷卡 2.5%＋高亮刷卡每笔 $3" },
                totalIncomeCents: { value: money(summary.totals.totalIncomeCents), caption: "店铺总结算收入" },
              };
              const metricByKey = new Map(financeSummaryMetrics.map((metric) => [metric.key, metric]));
              return financeSummaryGroups.map((group) => {
                const cards = <div className="finance-cards">{group.metricKeys.map((key) => {
                  const metric = metricByKey.get(key)!;
                  return <FinanceSummaryCard key={key} label={metric.label} explanation={metric.explanation} calculation={metric.calculation} {...values[key]} onViewDetails={() => void run(async () => { setDetailsTitle(metric.label); setDetails(null); await loadDetails(); })} />;
                })}</div>;
                return group.emphasis
                  ? <section className="finance-metric-group finance-metric-group--emphasis" key={group.key}><header><h2>{group.title}</h2></header>{cards}</section>
                  : <details className="finance-metric-group finance-metric-disclosure" key={group.key}><summary><strong>{group.title}</strong><span>查看构成</span></summary><p>{group.description}</p>{cards}</details>;
              });
            })()}
          <section className="finance-report-section"><div className="finance-report-heading"><div><h2>每日小计</h2><p>点击金额查看当天明细。</p></div><button className="secondary-action" type="button" aria-pressed={showDailyColumns} onClick={() => setShowDailyColumns(!showDailyColumns)}>{showDailyColumns ? "只看主要金额" : "显示全部列"}</button></div><div className="table-scroll"><table className={`data-table finance-daily-table${showDailyColumns ? " is-expanded" : ""}`}><thead><tr><th>日期</th><th>星期</th><th>今日流水</th><th>过去30天平均营业额</th><th>主要项目</th><th>加项</th><th>大费基数</th><th>折扣</th><th>折后大费</th><th>礼物卡销售</th><th>礼物卡核销支出</th><th>员工总收入</th><th>店铺收入</th><th>总收入</th></tr></thead><tbody>{summary.days.map((row) => { const scope = { dateFrom: row.businessDate, dateTo: row.businessDate }; return <tr key={row.businessDate}><td>{row.businessDate}</td><td>{weekday(row.businessDate, locale)}</td><td>{detailAmount(money(row.dailyTurnoverCents), `${row.businessDate}今日流水`, scope)}</td><td>{row.recentClosedRevenue ? <span title={`过去${row.recentClosedRevenue.dayCount}天平均营业额`}>{money(row.recentClosedRevenue.averageCents)}</span> : "—"}</td><td>{detailAmount(money(row.mainServiceAmountCents), `${row.businessDate}主要项目`, scope)}</td><td>{detailAmount(money(row.addonTotalCents), `${row.businessDate}额外项目`, scope)}</td><td>{detailAmount(money(row.grossFeeBaseCents), `${row.businessDate}大费基数`, scope)}</td><td>{detailAmount(money(row.discountTotalCents), `${row.businessDate}折扣`, scope)}</td><td>{detailAmount(money(row.discountedFeePerformanceCents), `${row.businessDate}折后大费`, scope)}</td><td>{detailAmount(money(row.giftCardSalesAmountCents), `${row.businessDate}礼物卡销售`, scope)}</td><td>{detailAmount(money(row.giftCardRedemptionCents), `${row.businessDate}礼物卡核销支出`, scope)}</td><td>{detailAmount(money(row.employeeIncomeCents), `${row.businessDate}员工总收入`, scope)}</td><td>{detailAmount(money(row.storeIncomeCents), `${row.businessDate}店铺收入`, scope)}</td><td>{detailAmount(money(row.totalIncomeCents), `${row.businessDate}总收入`, scope)}</td></tr>; })}</tbody></table></div></section>
          <EmployeeSubtotalSection
            storeId={membership.store.id}
            summary={summary}
            ownerPhone={ownerPhone}
            canSend={canManage}
            busy={busy}
            run={run}
            onViewDetails={(selectedMembershipId, label) => void run(async () => { setDetailsTitle(label); setDetails(null); await loadDetails({ memberIds: [selectedMembershipId] }); })}
          />
        </section>
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
    <div className="table-scroll"><table className="data-table">
      <thead><tr><th>员工</th><th>日期范围</th><th>金额</th><th>工资来源</th>{canManage && <th>操作</th>}</tr></thead>
      <tbody>{settlements.map((item) => <tr key={item.id} className={item.deletedAt ? "deleted-row" : ""}>
        <td>{item.membership.displayName}</td>
        <td>{dateOnly(item.periodStart)} 至 {dateOnly(item.periodEnd)}{item.historyChangedAfterSettlement && <strong className="history-warning">结算后历史数据发生过修改</strong>}</td>
        <td>{formatUsdPrecise(item.totalPaidCents)}</td>
        <td>{item.paymentScope === "CASH" ? "现金" : item.paymentScope === "NON_CASH" ? "刷卡＋礼物卡" : item.paymentScope === "ALL" ? "全部" : "历史记录未指定"}</td>
        {canManage && <td>{item.deletedAt ? <button className="table-action" type="button" disabled={busy} onClick={() => void run(async () => {
          await apiRequest(`/stores/${storeId}/payroll-settlements/${item.id}/restore`, { method: "POST", idempotent: true, body: { version: item.version } });
          await reload();
        })}>恢复</button> : <span className="table-actions">
          <button className="table-action" type="button" disabled={busy} onClick={() => setEditing(item)}>修改</button>
          <button className="table-action danger" type="button" disabled={busy} onClick={() => void run(async () => {
            if (!window.confirm("确认删除这条工资结算吗？余额会立即重新计算。")) return;
            await apiRequest(`/stores/${storeId}/payroll-settlements/${item.id}`, { method: "DELETE", idempotent: true, body: { version: item.version } });
            await reload();
          })}>删除</button>
        </span>}</td>}
      </tr>)}</tbody>
    </table></div>
    {editing && <div className="modal-backdrop" role="presentation"><PayrollEntryForm key={editing.id} storeId={storeId} businessDate={businessDate} members={members} settlement={editing} busy={busy} close={() => setEditing(null)} run={run} onSaved={reload} /></div>}
  </section>;
}
