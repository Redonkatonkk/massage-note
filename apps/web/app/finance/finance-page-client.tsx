"use client";

import { useCallback, useEffect, useState } from "react";
import { apiBase, apiRequest, errorMessage } from "../../lib/api";
import { hasBlockingClosingWarnings } from "../../lib/closing";
import { formatMoneyInput, formatUsd } from "../../lib/money";
import type {
  CashSettlementResponse,
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
import { AppNav } from "../app-nav";
import { ClosingDeliveryQueue } from "../closing-delivery-queue";
import { EmployeeClosingSummary } from "../employee-closing";
import { FloatingAiAssistant } from "../floating-ai-assistant";
import { useLanguage } from "../language-provider";
import { RecordEditor } from "../record-editor";
import { GiftCardLedger } from "./gift-card-ledger";
import { BusinessDatePicker } from "../business-date-picker";
import { EmployeeSettlementPanel } from "./employee-settlement-panel";
import { EmployeeSubtotalSection } from "./employee-subtotal-section";
import {
  financeSummaryGroups,
  financeSummaryMetrics,
  type FinanceSummaryMetricKey,
} from "./summary-metrics";

type FinanceTab = "summary" | "cash" | "closing" | "giftCards" | "payroll";
type FinanceRangeOverride = { dateFrom?: string; dateTo?: string; memberIds?: string[] };

function money(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "—";
  return formatUsd(cents);
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
        <summary aria-label={`查看“${label}”的解释和计算方法`}>!</summary>
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
  const [summary, setSummary] = useState<FinanceSummaryResponse | null>(null);
  const [details, setDetails] = useState<FinanceDetailsResponse | null>(null);
  const [detailsTitle, setDetailsTitle] = useState("财务数据");
  const [cashData, setCashData] = useState<CashSettlementResponse | null>(null);
  const [closing, setClosing] = useState<ClosingPreview | null>(null);
  const [closingDeliveries, setClosingDeliveries] = useState<ClosingDeliveryList | null>(null);
  const [myClosing, setMyClosing] = useState<EmployeeClosingPreview | null>(null);
  const [payroll, setPayroll] = useState<PayrollSettlement[]>([]);
  const [giftCards, setGiftCards] = useState<GiftCardLedgerResponse | null>(null);
  const [editingRecord, setEditingRecord] = useState<WorkRecord | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cashDate, setCashDate] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<FinanceSummaryResponse["filters"]["paymentMethod"]>("ALL");
  const [amountType, setAmountType] = useState("ALL");
  const [highlightFilter, setHighlightFilter] = useState<FinanceSummaryResponse["filters"]["highlightFilter"]>("ALL");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      const result = await apiRequest<ClosingPreview>(`/stores/${membership.store.id}/closings/${cashDate}/preview`);
      setClosing(result);
      setClosingDeliveries(result.isClosed ? await apiRequest<ClosingDeliveryList>(`/stores/${membership.store.id}/closings/${cashDate}/deliveries`) : null);
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

  const queueClosingDeliveries = useCallback(async () => {
    if (!membership || !cashDate) return;
    const result = await apiRequest<{ queuedCount: number; skippedCount: number }>(`/stores/${membership.store.id}/closings/${cashDate}/deliveries/batch`, { method: "POST", idempotent: true });
    setClosingDeliveries(await apiRequest<ClosingDeliveryList>(`/stores/${membership.store.id}/closings/${cashDate}/deliveries`));
    window.alert(`已排队 ${result.queuedCount} 位员工${result.skippedCount ? `，跳过 ${result.skippedCount} 位` : ""}`);
  }, [membership, cashDate]);

  const cancelClosingDelivery = useCallback(async (delivery: ClosingDeliveryItem) => {
    if (!membership || !cashDate) return;
    await apiRequest(`/stores/${membership.store.id}/closings/${cashDate}/deliveries/${delivery.id}`, { method: "DELETE" });
    setClosingDeliveries(await apiRequest<ClosingDeliveryList>(`/stores/${membership.store.id}/closings/${cashDate}/deliveries`));
  }, [membership, cashDate]);

  useEffect(() => {
    if (!membership || !canManage || tab !== "closing" || !closing?.isClosed || !cashDate) return;
    const load = () => void apiRequest<ClosingDeliveryList>(`/stores/${membership.store.id}/closings/${cashDate}/deliveries`).then(setClosingDeliveries).catch(() => undefined);
    const timer = window.setInterval(load, 15_000);
    return () => window.clearInterval(timer);
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

  const realtimeState = useStoreRealtime(membership?.store.id, async () => {
    await Promise.all([loadSummary(), loadCash(), loadPayroll(), loadClosing(), loadGiftCards()]);
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
        const requestedTab = new URL(window.location.href).searchParams.get("tab");
        if (["summary", "cash", "closing", "payroll"].includes(requestedTab ?? "") || (requestedTab === "giftCards" && selected.role !== "EMPLOYEE")) {
          setTab(requestedTab as FinanceTab);
        }
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
    return <main className="center-page"><div className="loading-card"><span className="spinner" /><strong>{error || "正在加载财务数据…"}</strong></div></main>;
  }

  const financeTabs: Array<[FinanceTab, string]> = [
    ["summary", "财务汇总"],
    ["cash", "现金结算"],
    ["closing", canManage ? "日结" : "我的日结"],
  ];
  if (canManage) financeTabs.push(["giftCards", "礼物卡"]);
  financeTabs.push(["payroll", canManage ? "工资结算" : "工资结算明细"]);
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
          <button key={value} className={tab === value ? "active" : ""} type="button" onClick={() => setTab(value)}>{label}</button>
        ))}
      </nav>
      {error && <p className="form-error" role="alert">{error}</p>}

      {tab === "summary" && summary && (
        <section className="finance-section">
          <form className="filter-panel" onSubmit={(event) => { event.preventDefault(); void run(loadSummary); }}>
            <div className="filter-panel__heading"><div><strong>筛选范围</strong><p>先选日期；需要时再限定员工、付款方式、金额类型和高亮状态。</p></div><a className="secondary-action export-link" href={`${apiBase}/stores/${membership.store.id}/finance/export.csv?${currentFinanceParams()}`} download>导出当前结果</a></div>
            <div className="quick-ranges" aria-label="快捷日期范围"><button type="button" disabled={busy} onClick={() => void run(() => loadSummary({ dateFrom: day.businessDate, dateTo: day.businessDate }))}>今天</button><button type="button" disabled={busy} onClick={() => void run(() => loadSummary({ dateFrom: shiftDate(day.businessDate, -6), dateTo: day.businessDate }))}>最近 7 天</button><button type="button" disabled={busy} onClick={() => void run(() => loadSummary({ dateFrom: `${day.businessDate.slice(0, 8)}01`, dateTo: day.businessDate }))}>本月</button></div>
            <label>开始日期<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label>
            <label>结束日期<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label>
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
            <div className="filter-actions"><button className="primary-action" type="submit" disabled={busy}>查看结果</button></div>
          </form>
          {(() => {
              const values: Record<FinanceSummaryMetricKey, { value: string; caption: string }> = {
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
                totalIncomeCents: { value: money(summary.totals.totalIncomeCents), caption: "前四项相加－信用卡手续费" },
              };
              const metricByKey = new Map(financeSummaryMetrics.map((metric) => [metric.key, metric]));
              return financeSummaryGroups.map((group) => <section className={`finance-metric-group${group.emphasis ? " finance-metric-group--emphasis" : ""}`} key={group.key}><header><div><h2>{group.title}</h2><p>{group.description}</p></div></header><div className="finance-cards">{group.metricKeys.map((key) => { const metric = metricByKey.get(key)!; return <FinanceSummaryCard key={key} label={metric.label} explanation={metric.explanation} calculation={metric.calculation} {...values[key]} onViewDetails={() => void run(async () => { setDetailsTitle(metric.label); setDetails(null); await loadDetails(); })} />; })}</div></section>);
            })()}
          <section className="finance-report-section"><div className="finance-report-heading"><div><h2>每日小计</h2><p>员工收入按当前付款方式只计算对应部分；点击金额可查看当天组成。</p></div></div><div className="table-scroll"><table className="data-table"><thead><tr><th>日期</th><th>星期</th><th>今日流水</th><th>主要项目</th><th>加项</th><th>大费基数</th><th>折扣</th><th>折后大费</th><th>礼物卡销售</th><th>礼物卡核销支出</th><th>员工总收入</th><th>店铺收入</th></tr></thead><tbody>{summary.days.map((row) => { const scope = { dateFrom: row.businessDate, dateTo: row.businessDate }; return <tr key={row.businessDate}><td>{row.businessDate}</td><td>{weekday(row.businessDate, locale)}</td><td>{detailAmount(money(row.dailyTurnoverCents), `${row.businessDate}今日流水`, scope)}</td><td>{detailAmount(money(row.mainServiceAmountCents), `${row.businessDate}主要项目`, scope)}</td><td>{detailAmount(money(row.addonTotalCents), `${row.businessDate}额外项目`, scope)}</td><td>{detailAmount(money(row.grossFeeBaseCents), `${row.businessDate}大费基数`, scope)}</td><td>{detailAmount(money(row.discountTotalCents), `${row.businessDate}折扣`, scope)}</td><td>{detailAmount(money(row.discountedFeePerformanceCents), `${row.businessDate}折后大费`, scope)}</td><td>{detailAmount(money(row.giftCardSalesAmountCents), `${row.businessDate}礼物卡销售`, scope)}</td><td>{detailAmount(money(row.giftCardRedemptionCents), `${row.businessDate}礼物卡核销支出`, scope)}</td><td>{detailAmount(money(row.employeeIncomeCents), `${row.businessDate}员工总收入`, scope)}</td><td>{detailAmount(money(row.storeIncomeCents), `${row.businessDate}店铺收入`, scope)}</td></tr>; })}</tbody></table></div></section>
          <EmployeeSubtotalSection
            storeId={membership.store.id}
            summary={summary}
            ownerPhone={ownerPhone}
            canSend={canManage}
            busy={busy}
            run={run}
            onViewDetails={(selectedMembershipId, label) => void run(async () => { setDetailsTitle(label); setDetails(null); await loadDetails({ memberIds: [selectedMembershipId] }); })}
          />
          <section className="finance-report-section"><div className="finance-report-heading"><div><h2>累计余额</h2><p>汇总员工累计应得、现金已取得和工资已支付，快速确认尚欠金额。</p></div></div><div className="balance-list">{summary.balances.map((balance) => <article key={balance.membershipId}><div><strong>{balance.displayName}</strong><span>{balance.excludedOwner ? "店主不进入工资结算" : `累计应得 ${money(balance.cumulativeEmployeeIncomeCents)}`}</span></div>{!balance.excludedOwner && <div className="balance-numbers"><span>现金已取得 {money(balance.settledCashAcquiredCents)}</span><span>工资已支付 {money(balance.payrollPaidCents)}</span><strong>尚欠 {money(balance.employerOwesCents)}</strong>{balance.overpaidCents > 0 && <em>超付 {money(balance.overpaidCents)}</em>}</div>}</article>)}</div></section>
        </section>
      )}

      {tab === "cash" && cashData && (
        <section className="finance-section">
          <div className="date-toolbar"><label>营业日<input type="date" value={cashDate} max={day.businessDate} onChange={(event) => setCashDate(event.target.value)} /></label>{canManage && cashData.rows.length > 0 && <button className="primary-action" type="button" disabled={busy || cashData.rows.every((row) => row.status === "SETTLED")} onClick={() => run(async () => { await apiRequest(`/stores/${membership.store.id}/cash-settlements/${cashDate}/settle-all`, { method: "POST", idempotent: true, body: { settlements: cashData.rows.map((row) => ({ membershipId: row.membershipId, version: row.version, ...(row.note ? { note: row.note } : {}) })) } }); await loadCash(); await loadSummary(); })}>一键全部结清</button>}</div>
          <p className="field-help">现金结算只记录“未结清/已全部结清”，不记录部分提交，也不把员工应交现金与老板尚欠合并。</p>
          <div className="cash-grid">{cashData.rows.map((row) => <article key={row.membershipId} className={row.status === "SETTLED" ? "settled" : ""}><header><div><strong>{row.displayName}</strong><span>{row.status === "SETTLED" ? "已全部结清" : "未结清"}</span></div><em>{row.status === "SETTLED" ? "已结清" : "待确认"}</em></header><dl><div><dt>现金大费</dt><dd>{money(row.cashServiceCents)}</dd></div><div><dt>现金小费</dt><dd>{money(row.cashTipCents)}</dd></div><div><dt>共收到现金</dt><dd>{money(row.cashReceivedCents)}</dd></div><div><dt>现金对应工资</dt><dd>{money(row.cashAllocatedServiceWageCents)}</dd></div><div><dt>实际取得工资</dt><dd>{money(row.cashAcquiredServiceWageCents)}</dd></div><div><dt>工资缺口</dt><dd>{money(row.cashWageShortfallCents)}</dd></div><div><dt>员工应保留</dt><dd>{money(row.cashRetainedCents)}</dd></div><div><dt>应提交店铺</dt><dd>{money(row.cashToSubmitToStoreCents)}</dd></div></dl><p className="cash-settlement-meta"><span>备注：{row.note || "未填写"}</span><span>结算人：{row.settledByDisplayName || "尚未结算"}</span><span>结算时间：{row.settledAt ? new Date(row.settledAt).toLocaleString("zh-CN") : "尚未结算"}</span></p>{canManage && <button className={row.status === "SETTLED" ? "secondary-action" : "primary-action"} type="button" disabled={busy} onClick={() => run(async () => { if (row.status === "SETTLED") { const reason = window.prompt("请填写取消结清原因"); if (!reason?.trim()) return; await apiRequest(`/stores/${membership.store.id}/cash-settlements/${cashDate}/${row.membershipId}/reopen`, { method: "POST", idempotent: true, body: { version: row.version, reason: reason.trim() } }); } else { const answer = window.prompt("结算备注（可留空）"); if (answer === null) return; const note = answer.trim(); await apiRequest(`/stores/${membership.store.id}/cash-settlements/${cashDate}/${row.membershipId}/settle`, { method: "POST", idempotent: true, body: { version: row.version, ...(note ? { note } : {}) } }); } await loadCash(); await loadSummary(); })}>{row.status === "SETTLED" ? "取消结清" : "标记全部结清"}</button>}</article>)}</div>
          {cashData.rows.length === 0 && <p className="empty-state">当日没有记工，无需现金结算。</p>}
        </section>
      )}

      {tab === "closing" && canManage && closing && (
        <section className="finance-section">
          <div className="date-toolbar"><div className="business-date-field"><span>营业日</span><BusinessDatePicker storeId={membership.store.id} value={cashDate} max={day.businessDate} ariaLabel="选择日结营业日" onChange={setCashDate} /></div><button className="secondary-action" type="button" disabled={busy} onClick={() => run(loadClosing)}>重新检查</button></div>
          <div className={`closing-status ${closing.hasWarnings ? "warning" : "ready"}`}><div><span>{closing.isClosed ? "已日结" : closingHasBlockingWarnings ? "发现日结异常" : "可以正常日结"}</span><strong>{closing.isClosed ? `第 ${closing.activeClosing?.cycleNo ?? 0} 次日结` : closing.hasWarnings ? `${closing.warningCount} 项提醒` : "检查通过"}</strong></div>{closing.isClosed ? <button className="secondary-action" type="button" disabled={busy} onClick={() => run(async () => { const reason = window.prompt("请填写取消日结原因"); if (!reason?.trim() || !closing.activeClosing) return; await apiRequest(`/stores/${membership.store.id}/closings/${cashDate}/cancel`, { method: "POST", idempotent: true, body: { version: closing.activeClosing.version, reason: reason.trim() } }); await loadClosing(); await loadCash(); })}>取消日结</button> : <div className="closing-actions"><button className="primary-action" type="button" disabled={busy || closingHasBlockingWarnings} onClick={() => run(async () => { await apiRequest(`/stores/${membership.store.id}/closings/${cashDate}`, { method: "POST", idempotent: true, body: { force: false } }); await loadClosing(); })}>确认日结</button>{closingHasBlockingWarnings && <button className="danger-button" type="button" disabled={busy} onClick={() => run(async () => { const reason = window.prompt("强制日结会保留全部异常快照，请填写原因"); if (!reason?.trim()) return; await apiRequest(`/stores/${membership.store.id}/closings/${cashDate}`, { method: "POST", idempotent: true, body: { force: true, forceReason: reason.trim() } }); await loadClosing(); })}>强制日结</button>}</div>}</div>
          {closing.warnings.length > 0 && <div className="warning-list">{closing.warnings.map((warning) => <article key={warning.code}><div className="warning-list__heading"><strong>{warning.labelZh}</strong><span>{warning.count} 条记录</span></div>{warning.blocking === false && <p className="warning-list__notice">仅提醒，不影响正常日结</p>}<div className="warning-record-links">{warning.recordIds.map((recordId, index) => <button className="secondary-action compact" key={recordId} type="button" disabled={busy} onClick={() => openWarningRecord(recordId)} aria-label={`查看${warning.labelZh}第 ${index + 1} 单`}>查看第 {index + 1} 单</button>)}</div></article>)}</div>}
          {closing.isClosed && <section className="closing-delivery-panel">
            <div><strong>员工个人日结短信</strong><p>{closingDeliveries?.batchBlockedReason ?? "直接排队所有已开启接收、号码有效且当天有记工的员工。"}</p></div>
            <button className="primary-action" type="button" disabled={busy || closingDeliveries?.batchAllowed === false} onClick={() => run(queueClosingDeliveries)}>{closingDeliveries?.batchAllowed === false ? "仅可逐人补发" : "发送员工小结"}</button>
            {closingDeliveries && <ClosingDeliveryQueue value={closingDeliveries} busy={busy} onCancel={(delivery) => void run(() => cancelClosingDelivery(delivery))} />}
          </section>}
          <h2 className="table-title">全店日结合计</h2><div className="finance-cards closing-totals"><article><span>全部项目数量</span><strong>{closing.storeTotals.itemCount} 项</strong><small>{closing.storeTotals.recordCount} 条记工 · {closing.storeTotals.giftCardSaleCount} 张礼物卡</small></article><article><span>全店大费基数</span><strong>{money(closing.storeTotals.grossFeeBaseCents)}</strong></article><article><span>全店折扣总额</span><strong>{money(closing.storeTotals.discountTotalCents)}</strong></article><article className="balance-card"><span>全店折后大费业绩</span><strong>{money(closing.storeTotals.discountedFeePerformanceCents)}</strong></article><article><span>全店小费总额</span><strong>{money(closing.storeTotals.totalTipCents)}</strong></article><article><span>全店客人总付款</span><strong>{money(closing.storeTotals.customerTotalPaidCents)}</strong><small>含服务、小费和礼物卡销售实收</small></article><article><span>礼物卡销售收入</span><strong>{money(closing.storeTotals.giftCardSalesAmountCents)}</strong><small>{closing.storeTotals.giftCardSaleCount} 张 · 现金 {money(closing.storeTotals.giftCardSaleCashCents)} · 刷卡 {money(closing.storeTotals.giftCardSaleCardCents)}</small></article><article><span>礼物卡核销支出</span><strong>{money(closing.storeTotals.giftCardRedemptionCents)}</strong><small>礼物卡大费＋礼物卡小费</small></article><article className="balance-card"><span>店铺收入</span><strong>{money(closing.storeTotals.storeIncomeCents)}</strong><small>卖卡记收入，核销记支出</small></article></div>
          <h2 className="table-title">每位员工日结检查</h2><div className="table-scroll"><table className="data-table"><thead><tr><th>员工</th><th>单数</th><th>大费基数</th><th>折扣</th><th>折后大费</th><th>小费</th><th>应得工资</th><th>待结账</th></tr></thead><tbody>{closing.employees.map((row) => <tr key={row.membershipId}><td>{row.displayName}</td><td>{row.recordCount}</td><td>{money(row.grossFeeBaseCents)}</td><td>{money(row.discountTotalCents)}</td><td>{money(row.discountedFeePerformanceCents)}</td><td>{money(row.totalTipCents)}</td><td>{money(row.employeeIncomeCents)}</td><td>{row.incompleteRecordCount}</td></tr>)}</tbody></table></div>
        </section>
      )}

      {tab === "closing" && !canManage && (
        <section className="finance-section employee-closing-finance-section">
          <div className="date-toolbar"><div className="business-date-field"><span>营业日</span><BusinessDatePicker storeId={membership.store.id} value={cashDate} max={day.businessDate} ariaLabel="选择日结营业日" onChange={setCashDate} /></div><button className="secondary-action" type="button" disabled={busy} onClick={() => run(loadClosing)}>重新加载</button></div>
          <p className="employee-closing-privacy">这里只显示你自己的收入、应提交现金和非现金分红，不会加载或展示全店及其他员工日结。</p>
          {myClosing ? <EmployeeClosingSummary key={`${myClosing.businessDate}-${myClosing.employee.membershipId}`} preview={myClosing} /> : <div className="loading-card"><span className="spinner" /><strong>正在加载个人日结…</strong></div>}
        </section>
      )}

      {tab === "giftCards" && canManage && giftCards && (
        <GiftCardLedger ledger={giftCards} />
      )}

      {tab === "payroll" && (
        <PayrollPanel storeId={membership.store.id} businessDate={day.businessDate} canManage={canManage} members={members} settlements={payroll} busy={busy} run={run} reload={async () => { await loadPayroll(); await loadSummary(); }} />
      )}

      <FloatingAiAssistant storeId={membership.store.id} type="finance" />
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
          onClose={() => setEditingRecord(null)}
          onSaved={() => undefined}
          onChanged={async () => {
            await Promise.all([loadSummary(), loadCash(), loadClosing(), loadGiftCards()]);
          }}
        />
      )}
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
  const [serviceWage, setServiceWage] = useState("0");
  const [cashTip, setCashTip] = useState("0");
  const [cardTip, setCardTip] = useState("0");
  const [adjustment, setAdjustment] = useState("0");
  const [method, setMethod] = useState("ZELLE");
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState<PayrollSettlement | null>(null);
  return <section className="finance-section">
    {canManage && <EmployeeSettlementPanel storeId={storeId} businessDate={businessDate} members={members} busy={busy} run={run} />}
    {canManage && <form className="payroll-form" onSubmit={(event) => { event.preventDefault(); void run(async () => { const input = { membershipId: memberId, settlementDate, periodStart, periodEnd, serviceWageCents: cents(serviceWage, "大费工资"), cashTipCents: cents(cashTip, "现金小费"), cardTipCents: cents(cardTip, "刷卡／礼物卡小费"), adjustmentCents: cents(adjustment, "其他调整", true), paymentMethod: method, note }; const total = input.serviceWageCents + input.cashTipCents + input.cardTipCents + input.adjustmentCents; let negativeTotalReason: string | undefined; if (total < 0) { const reason = window.prompt("本次支付总额为负数，请二次确认并填写原因"); if (!reason?.trim()) return; negativeTotalReason = reason.trim(); } await apiRequest(`/stores/${storeId}/payroll-settlements`, { method: "POST", idempotent: true, body: { ...input, ...(negativeTotalReason ? { negativeTotalReason } : {}) } }); setNote(""); await reload(); }); }}><h2>新增工资结算</h2><div className="payroll-fields"><label>员工<select required value={memberId} onChange={(event) => setMemberId(event.target.value)}>{payable.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label><label>结算日期<input type="date" value={settlementDate} onChange={(event) => setSettlementDate(event.target.value)} /></label><label>覆盖开始<input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label><label>覆盖结束<input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label><label>大费工资（美元）<input inputMode="decimal" value={serviceWage} onChange={(event) => setServiceWage(event.target.value)} /></label><label>现金小费（美元）<input inputMode="decimal" value={cashTip} onChange={(event) => setCashTip(event.target.value)} /></label><label>刷卡／礼物卡小费（美元）<input inputMode="decimal" value={cardTip} onChange={(event) => setCardTip(event.target.value)} /></label><label>其他调整（美元）<input inputMode="decimal" value={adjustment} onChange={(event) => setAdjustment(event.target.value)} /></label><label>支付方式<select value={method} onChange={(event) => setMethod(event.target.value)}><option value="ZELLE">Zelle</option><option value="CASH">现金</option><option value="CHECK">支票</option><option value="CARD">刷卡</option><option value="OTHER">其他</option></select></label><label className="wide">备注<input value={note} maxLength={2000} onChange={(event) => setNote(event.target.value)} /></label></div><button className="primary-action" type="submit" disabled={busy || !memberId}>保存工资结算</button></form>}
    <h2 className="table-title">工资结算账本</h2><div className="table-scroll"><table className="data-table"><thead><tr><th>员工</th><th>结算日期</th><th>覆盖范围</th><th>大费工资</th><th>现金小费</th><th>刷卡／礼物卡小费</th><th>调整</th><th>本次总额</th><th>方式</th><th>备注</th><th>操作人</th><th>最后修改</th><th>历史状态</th><th>操作</th></tr></thead><tbody>{settlements.map((item) => <tr key={item.id} className={item.deletedAt ? "deleted-row" : ""}><td>{item.membership.displayName}</td><td>{dateOnly(item.settlementDate)} </td><td>{dateOnly(item.periodStart)} 至 {dateOnly(item.periodEnd)}</td><td>{money(item.serviceWageCents)}</td><td>{money(item.cashTipCents)}</td><td>{money(item.cardTipCents)}</td><td>{money(item.adjustmentCents)}</td><td>{money(item.totalPaidCents)}</td><td>{payrollMethodText(item.paymentMethod)}</td><td>{item.note || "—"}</td><td>{item.updatedByDisplayName}</td><td>{new Date(item.updatedAt).toLocaleString("zh-CN")}</td><td>{item.historyChangedAfterSettlement ? <strong className="history-warning">结算后历史数据发生过修改</strong> : "未发现后续修改"}</td><td>{canManage && (item.deletedAt ? <button className="table-action" type="button" onClick={() => void run(async () => { await apiRequest(`/stores/${storeId}/payroll-settlements/${item.id}/restore`, { method: "POST", idempotent: true, body: { version: item.version } }); await reload(); })}>恢复</button> : <span className="table-actions"><button className="table-action" type="button" onClick={() => setEditing(item)}>修改</button><button className="table-action danger" type="button" onClick={() => void run(async () => { if (!window.confirm("确认删除这条工资结算吗？余额会立即重新计算。")) return; const answer = window.prompt("删除原因（可留空）"); if (answer === null) return; const reason = answer.trim(); await apiRequest(`/stores/${storeId}/payroll-settlements/${item.id}`, { method: "DELETE", idempotent: true, body: { version: item.version, ...(reason ? { reason } : {}) } }); await reload(); })}>删除</button></span>)}</td></tr>)}</tbody></table></div>
    {editing && <PayrollEditForm storeId={storeId} settlement={editing} busy={busy} close={() => setEditing(null)} run={run} reload={async () => { setEditing(null); await reload(); }} />}
  </section>;
}

function PayrollEditForm({ storeId, settlement, busy, close, run, reload }: { storeId: string; settlement: PayrollSettlement; busy: boolean; close: () => void; run: (action: () => Promise<void>) => Promise<void>; reload: () => Promise<void> }) {
  const [settlementDate, setSettlementDate] = useState(dateOnly(settlement.settlementDate));
  const [periodStart, setPeriodStart] = useState(dateOnly(settlement.periodStart));
  const [periodEnd, setPeriodEnd] = useState(dateOnly(settlement.periodEnd));
  const [serviceWage, setServiceWage] = useState(formatMoneyInput(settlement.serviceWageCents));
  const [cashTip, setCashTip] = useState(formatMoneyInput(settlement.cashTipCents));
  const [cardTip, setCardTip] = useState(formatMoneyInput(settlement.cardTipCents));
  const [adjustment, setAdjustment] = useState(formatMoneyInput(settlement.adjustmentCents));
  const [method, setMethod] = useState<PayrollSettlement["paymentMethod"]>(settlement.paymentMethod);
  const [note, setNote] = useState(settlement.note);
  return <div className="modal-backdrop" role="presentation"><form className="payroll-form payroll-edit-modal" role="dialog" aria-modal="true" aria-labelledby="payroll-edit-title" onSubmit={(event) => { event.preventDefault(); void run(async () => { const input = { version: settlement.version, settlementDate, periodStart, periodEnd, serviceWageCents: cents(serviceWage, "大费工资"), cashTipCents: cents(cashTip, "现金小费"), cardTipCents: cents(cardTip, "刷卡小费"), adjustmentCents: cents(adjustment, "其他调整", true), paymentMethod: method, note }; const total = input.serviceWageCents + input.cashTipCents + input.cardTipCents + input.adjustmentCents; let negativeTotalReason: string | undefined; if (total < 0) { const reason = window.prompt("修改后支付总额为负数，请二次确认并填写原因"); if (!reason?.trim()) return; negativeTotalReason = reason.trim(); } await apiRequest(`/stores/${storeId}/payroll-settlements/${settlement.id}`, { method: "PATCH", idempotent: true, body: { ...input, ...(negativeTotalReason ? { negativeTotalReason } : {}) } }); await reload(); }); }}><div className="modal-heading"><div><p className="eyebrow">修改工资结算</p><h2 id="payroll-edit-title">{settlement.membership.displayName}</h2></div><button className="close-button" type="button" onClick={close} disabled={busy}>关闭</button></div><div className="payroll-fields"><label>结算日期<input type="date" value={settlementDate} onChange={(event) => setSettlementDate(event.target.value)} /></label><label>覆盖开始<input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label><label>覆盖结束<input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label><label>大费工资（美元）<input inputMode="decimal" value={serviceWage} onChange={(event) => setServiceWage(event.target.value)} /></label><label>现金小费（美元）<input inputMode="decimal" value={cashTip} onChange={(event) => setCashTip(event.target.value)} /></label><label>刷卡小费（美元）<input inputMode="decimal" value={cardTip} onChange={(event) => setCardTip(event.target.value)} /></label><label>其他调整（美元）<input inputMode="decimal" value={adjustment} onChange={(event) => setAdjustment(event.target.value)} /></label><label>支付方式<select value={method} onChange={(event) => setMethod(event.target.value as PayrollSettlement["paymentMethod"])}><option value="ZELLE">Zelle</option><option value="CASH">现金</option><option value="CHECK">支票</option><option value="CARD">刷卡</option><option value="OTHER">其他</option></select></label><label className="wide">备注<input maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} /></label></div><div className="preview-actions"><button className="primary-action" type="submit" disabled={busy}>保存修改</button><button className="secondary-action" type="button" onClick={close} disabled={busy}>取消</button></div></form></div>;
}
