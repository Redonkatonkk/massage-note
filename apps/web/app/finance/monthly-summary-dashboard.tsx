"use client";

import { useEffect, useState, type ReactNode } from "react";
import type { FinanceAnalyticsResponse } from "@massage-note/contracts";
import { isPortfolioDemo } from "../../lib/demo-mode";
import { apiBase, apiRequest, errorMessage } from "../../lib/api";
import { formatUsdPrecise } from "../../lib/money";
import type { FinanceSummaryResponse } from "../../lib/types";
import { useLanguage } from "../language-provider";
import { UiIcon, type IconName } from "../ui/primitives";
import { Chart } from "./analytics-chart";
import { monthlyAverageDays, monthlyChange, monthlyComparisonPeriods, monthlyQuery, monthlyRanges, shiftMonth, type MonthlyHighlightFilter } from "./monthly-summary";

type Totals = FinanceSummaryResponse["totals"];
type Metric = { key: keyof Totals; label: string; caption: string; icon: IconName };

function useMonthlyRequest<T>(path: string | null, revision: FinanceSummaryResponse | null) {
  const [result, setResult] = useState<{ path: string; data: T | null; error: string; loading: boolean } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!path || !revision) return;
    let active = true;
    setResult({ path, data: null, error: "", loading: true });
    void apiRequest<T>(path)
      .then(data => { if (active) setResult({ path, data, error: "", loading: false }); })
      .catch(error => { if (active) setResult({ path, data: null, error: errorMessage(error), loading: false }); });
    return () => { active = false; };
  }, [path, revision, attempt]);
  const scoped = revision && result?.path === path ? result : null;
  return { data: scoped?.data ?? null, error: scoped?.error ?? "", loading: Boolean(path && revision && (!scoped || scoped.loading)), retry: () => setAttempt(value => value + 1) };
}

export function MonthlySummaryDashboard({ storeId, today, month, highlightFilter, summary, loading, failed, busy, canViewStoreTrend, onMonthChange, onRetry, onQuery, onViewDetails, children }: {
  storeId: string;
  today: string;
  month: string;
  highlightFilter: MonthlyHighlightFilter;
  summary: FinanceSummaryResponse | null;
  loading: boolean;
  failed: boolean;
  busy: boolean;
  canViewStoreTrend: boolean;
  onMonthChange: (month: string) => void;
  onRetry: () => void;
  onQuery: (filter: MonthlyHighlightFilter) => void;
  onViewDetails: (title: string) => void;
  children?: ReactNode;
}) {
  const { locale } = useLanguage();
  const t = (zh: string, en: string) => locale === "en-US" ? en : zh;
  const money = (value: number) => formatUsdPrecise(value, locale);
  const [includeNonHighlighted, setIncludeNonHighlighted] = useState(highlightFilter !== "ONLY_HIGHLIGHTED");
  const [includeHighlighted, setIncludeHighlighted] = useState(highlightFilter !== "EXCLUDE_HIGHLIGHTED");
  const hasSelection = includeNonHighlighted || includeHighlighted;
  const ranges = monthlyRanges(month, today);
  // Keep amounts, exports and subtotals scoped to the applied month and highlight filter.
  const current = summary?.filters.dateFrom === ranges.dateFrom && summary.filters.dateTo === ranges.dateTo && summary.filters.highlightFilter === highlightFilter ? summary : null;
  const periods = monthlyComparisonPeriods(month, today);
  const previousPeriod = periods[1]!, earlierPeriod = periods[2]!;
  const previousResult = useMonthlyRequest<FinanceSummaryResponse>(`/stores/${storeId}/finance/summary?${monthlyQuery(previousPeriod.dateFrom, previousPeriod.dateTo, highlightFilter)}`, current);
  const earlierResult = useMonthlyRequest<FinanceSummaryResponse>(`/stores/${storeId}/finance/summary?${monthlyQuery(earlierPeriod.dateFrom, earlierPeriod.dateTo, highlightFilter)}`, current);
  const averageResult = useMonthlyRequest<FinanceAnalyticsResponse>(canViewStoreTrend ? `/stores/${storeId}/finance/analytics?${new URLSearchParams({ dateFrom: ranges.previousFrom, dateTo: ranges.dateTo, highlightFilter })}` : null, current);
  const previous = previousResult.data;
  const metrics: Metric[] = [
    { key: "totalTurnoverCents", label: t("月度总流水", "Monthly turnover"), caption: t("折后大费＋卖卡－礼卡核销", "Discounted services + card sales − redemptions"), icon: "wallet" },
    { key: "storeIncomeCents", label: t("月度店铺收入", "Monthly store income"), caption: t("店铺经营收入，已含礼卡净收支", "Store earnings, including net gift card flows"), icon: "store" },
    { key: "totalIncomeCents", label: t("月度总收入", "Monthly total income"), caption: t("店铺＋店长／经理收入－刷卡手续费", "Store + owner/manager earnings − card fees"), icon: "chart" },
    { key: "recordCount", label: t("服务单数", "Service records"), caption: t("含待结账记工，不含卖卡", "Includes pending services; excludes card sales"), icon: "log" },
  ];
  const changeText = (value: number, baseline: number, count = false) => {
    const change = monthlyChange(value, baseline);
    if (change.percent !== null) return `${change.percent > 0 ? "+" : ""}${change.percent.toFixed(1)}%`;
    if (baseline === 0 && value > 0) return t("新增", "New");
    return `${change.difference > 0 ? "+" : ""}${count ? change.difference.toLocaleString(locale) : money(change.difference)}`;
  };
  const currentDays = monthlyAverageDays(averageResult.data, ranges.dateFrom, ranges.dateTo);
  const previousDays = monthlyAverageDays(averageResult.data, ranges.previousFrom, ranges.previousTo);
  const averageDetail = (day: typeof currentDays[number]) => !day ? t("暂无数据", "Unavailable") : day.average30Cents === null ? t("—（未日结）", "— (not closed)") : `${money(Number(day.average30Cents))} · ${day.average30DayCount} ${t("个已日结日", "closed days")}`;
  const points = Array.from({ length: Math.max(currentDays.length, previousDays.length) }, (_, index) => {
    const value = currentDays[index], secondary = previousDays[index];
    const label = String(index + 1).padStart(2, "0");
    return { label, value: value?.average30Cents == null ? null : Number(value.average30Cents) / 100, secondary: secondary?.average30Cents == null ? null : Number(secondary.average30Cents) / 100,
      detail: `${t(`${label}日`, `Day ${label}`)} · ${month}: ${averageDetail(value ?? null)} · ${ranges.previousFrom.slice(0, 7)}: ${averageDetail(secondary ?? null)}` };
  });
  const paymentSources = current ? [
    { label: t("现金", "Cash"), value: current.totals.cashServiceCents, color: "var(--brand)" },
    { label: t("刷卡", "Card"), value: current.totals.cardServiceCents, color: "var(--chart-secondary)" },
    { label: t("礼物卡", "Gift card"), value: current.totals.giftCardServiceCents, color: "var(--pending-ink)" },
  ] : [];
  const paymentTotal = paymentSources.reduce((sum, source) => sum + source.value, 0);
  let ringOffset = 0;
  const monthlyRows: { key: keyof Totals; label: string; count?: boolean }[] = [
    { key: "totalTurnoverCents", label: t("总流水", "Total turnover") },
    { key: "storeIncomeCents", label: t("店铺收入", "Store income") },
    { key: "totalIncomeCents", label: t("总收入", "Total income") },
    { key: "recordCount", label: t("服务单数", "Service records"), count: true },
    { key: "employeeIncomeCents", label: t("员工总收入", "Employee earnings") },
    { key: "ownerWorkerIncomeCents", label: t("店长记工收入", "Owner service earnings") },
    { key: "managerWorkerIncomeCents", label: t("经理记工收入", "Manager service earnings") },
    { key: "totalLargeFeeWageCents", label: t("大费工资", "Service wages") },
    { key: "totalTipCents", label: t("小费总额", "Total tips") },
    { key: "discountTotalCents", label: t("折扣总额", "Discounts") },
    { key: "giftCardSalesAmountCents", label: t("礼物卡销售", "Gift card sales") },
    { key: "giftCardRedemptionCents", label: t("礼物卡核销", "Gift card redemptions") },
    { key: "creditCardFeeCents", label: t("刷卡手续费", "Card fees") },
    { key: "averageRevenueCents", label: t("日均营业额（已日结）", "Avg. revenue per closed day") },
  ];
  const valueText = (value: number | null | undefined, count = false) => value == null ? "—" : count ? value.toLocaleString(locale) : money(value);

  return <section className="monthly-finance" aria-label={t("月度汇总", "Monthly summary")} aria-busy={loading}>
    <header className="monthly-finance__toolbar">
      <div><p className="eyebrow">{t("每月经营账本", "MONTHLY FINANCES")}</p><h2>{t("月度汇总", "Monthly summary")}</h2><p>{ranges.dateFrom} — {ranges.dateTo}{ranges.partial ? t(" · 本月至今", " · Month to date") : t(" · 完整自然月", " · Full calendar month")}</p></div>
      <div className="monthly-finance__actions">
        <button className="secondary-action" type="button" disabled={busy || loading} onClick={onRetry}>{t("刷新", "Refresh")}</button>
        <div className="monthly-finance__month-picker">
          <button type="button" className="secondary-action" disabled={busy} aria-label={t("上一个月", "Previous month")} onClick={() => onMonthChange(shiftMonth(month, -1))}>‹</button>
          <label><input type="month" aria-label={t("选择月份", "Select month")} required max={today.slice(0, 7)} value={month} onChange={event => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(event.target.value) && event.target.value <= today.slice(0, 7)) onMonthChange(event.target.value); }} /></label>
          <button type="button" className="secondary-action" disabled={busy || month >= today.slice(0, 7)} aria-label={t("下一个月", "Next month")} onClick={() => onMonthChange(shiftMonth(month, 1))}>›</button>
        </div>
        {month !== today.slice(0, 7) && <button className="secondary-action" type="button" disabled={busy} onClick={() => onMonthChange(today.slice(0, 7))}>{t("回到本月", "This month")}</button>}
        {current && !isPortfolioDemo && <a className="primary-action export-link" href={`${apiBase}/stores/${storeId}/finance/export.csv?${monthlyQuery(ranges.dateFrom, ranges.dateTo, highlightFilter)}`} download><UiIcon name="log" />{t("导出本月", "Export month")}</a>}
      </div>
    </header>
    <form className="monthly-finance__filters" onSubmit={event => {
      event.preventDefault();
      if (hasSelection && !busy && !loading) onQuery(includeNonHighlighted && includeHighlighted ? "ALL" : includeHighlighted ? "ONLY_HIGHLIGHTED" : "EXCLUDE_HIGHLIGHTED");
    }}>
      <div className="monthly-finance__highlight-options" role="group" aria-label={t("高亮记工筛选", "Record highlight filter")}>
        <label><input type="checkbox" checked={includeNonHighlighted} disabled={busy || loading} onChange={event => setIncludeNonHighlighted(event.target.checked)} />{t("非高亮", "Non-highlighted")}</label>
        <label><input type="checkbox" checked={includeHighlighted} disabled={busy || loading} onChange={event => setIncludeHighlighted(event.target.checked)} />{t("高亮", "Highlighted")}</label>
      </div>
      <button className="secondary-action" type="submit" disabled={busy || loading || !hasSelection}>{t("查询", "Search")}</button>
      {!hasSelection && <p role="status">{t("请至少选择一项。", "Select at least one option.")}</p>}
    </form>
    <div className="monthly-finance__context"><p>{t("对比范围", "Comparison")}: {periods.slice(1).map(period => `${period.dateFrom} — ${period.dateTo}`).join(" · ")}{ranges.partial ? t(" · 同期（按日历日期对齐）", " · Same day-of-month ranges") : t(" · 完整自然月", " · Full calendar months")}</p><p>{t("汇总金额含未日结记录；均线仅使用已日结样本。总收入尚未扣除固定支出。", "Summary amounts include open days; averages use closed-day samples only. Total income is before operating expenses.")}</p></div>
    {current && current.totals.incompleteRecordCount > 0 && <div className="monthly-finance__status"><p>{t(`${current.totals.incompleteRecordCount} 单尚未结账，收入可能继续变化。`, `${current.totals.incompleteRecordCount} services await payment; amounts may change.`)}</p><button className="secondary-action" type="button" disabled={busy} onClick={() => onViewDetails(t("待结账记工", "Pending service records"))}>{t("核对记工", "Review services")}</button></div>}
    {failed && <div className="monthly-finance__status" role="alert"><p>{t("本月财务暂时无法读取。", "Monthly finances are unavailable.")}</p><button type="button" className="secondary-action" onClick={onRetry}>{t("重新加载", "Retry")}</button></div>}
    {!current && !failed && <p className="monthly-finance__status" role="status">{t("正在读取本月财务…", "Loading monthly finances…")}</p>}
    {[previousResult, earlierResult].map((result, index) => result.error && <div key={index} className="monthly-finance__status" role="status"><p>{periods[index + 1]!.month} · {t("月度对比暂时无法读取", "Monthly comparison is unavailable")}: {result.error}</p><button className="secondary-action" type="button" onClick={result.retry}>{t("重试对比", "Retry comparison")}</button></div>)}
    <div className="monthly-finance__metrics">
      {metrics.map(metric => {
        const value = current?.totals[metric.key], baseline = previous?.totals[metric.key];
        return <article className="monthly-finance__metric" key={metric.key}>
          <button type="button" disabled={!current || busy} onClick={() => onViewDetails(metric.label)}><span><UiIcon name={metric.icon} />{metric.label}</span><strong>{valueText(value, metric.key === "recordCount")}</strong></button>
          <div className="monthly-finance__metric-comparison">{value != null && baseline != null ? <><span className={`monthly-finance__change ${value > baseline ? "is-up" : value < baseline ? "is-down" : ""}`}>{changeText(value, baseline, metric.key === "recordCount")}</span><small>{t("较上月", "vs. previous month")}</small></> : <small>{previousResult.loading ? t("正在读取对比…", "Loading comparison…") : t("暂无可用对比", "Comparison unavailable")}</small>}</div>
          <p>{metric.caption}</p>
        </article>;
      })}
    </div>
    <div className="monthly-finance__hero">
      {canViewStoreTrend && averageResult.data ? <Chart key={month} className="monthly-finance__trend" title={t("每日最近30天平均营业额", "Daily trailing 30-day average revenue")} description={t("按月内日期对齐；取当日及此前29天内的已日结样本，包含月初之前的日期。未日结留空，空日结计零。", "Aligned by day of month. Each average uses closed days in that date’s trailing 30-day window, including dates before the month starts. Open days are gaps; empty closed days count as zero.")} points={points} currency fitToData
        series={[{ id: "current", label: month, color: "var(--brand)", values: points.map(point => point.value) }, { id: "previous", label: ranges.previousFrom.slice(0, 7), color: "var(--chart-secondary)", dash: "5 5", values: points.map(point => point.secondary ?? null) }]}
        controls={<div className="monthly-finance__chart-controls"><div className="monthly-finance__legend"><span><i style={{ background: "var(--brand)" }} />{month}</span><span><i style={{ background: "var(--chart-secondary)" }} />{ranges.previousFrom.slice(0, 7)}</span></div></div>} /> : <section className="analytics-card monthly-finance__trend"><h2>{t("每日最近30天平均营业额", "Daily trailing 30-day average revenue")}</h2>
          {averageResult.error ? <div role="status"><p>{t("均线暂时无法读取", "Average revenue is unavailable")}: {averageResult.error}</p><button type="button" className="secondary-action" onClick={averageResult.retry}>{t("重试均线", "Retry averages")}</button></div> : <p className="empty-state">{!canViewStoreTrend ? t("仅管理者可查看全店营业额走势。", "Store-wide revenue trends are available to managers only.") : failed ? t("数据暂时无法读取", "Data unavailable") : averageResult.loading ? t("正在读取30天平均营业额…", "Loading 30-day average revenue…") : t("等待本月数据", "Waiting for monthly data")}</p>}
        </section>}
      <section className="monthly-finance__panel monthly-finance__payments"><header><h2>{t("服务收款构成", "Service payments")}</h2><p>{t("仅大费，不含小费及卖卡收入", "Service fees only; excludes tips and card sales")}</p></header>
        {current ? <><div className="monthly-finance__donut"><svg viewBox="0 0 120 120" role="img" aria-label={t("现金、刷卡和礼物卡收款占比", "Cash, card and gift card payment shares")}><circle cx="60" cy="60" r="48" fill="none" stroke="var(--line)" strokeWidth="13" />{paymentSources.map(source => {
          const share = paymentTotal > 0 ? source.value / paymentTotal * 100 : 0;
          const offset = ringOffset; ringOffset += share;
          return <circle key={source.label} cx="60" cy="60" r="48" fill="none" stroke={source.color} strokeWidth="13" pathLength="100" strokeDasharray={`${share} ${100 - share}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)"><title>{source.label}: {money(source.value)}</title></circle>;
        })}</svg><div><strong>{money(paymentTotal)}</strong><span>{t("实收服务费", "Service fees collected")}</span></div></div>
        <dl className="monthly-finance__payment-list">{paymentSources.map(source => <div key={source.label}><dt><i style={{ background: source.color }} />{source.label}</dt><dd>{money(source.value)}<small>{paymentTotal > 0 ? `${(source.value / paymentTotal * 100).toFixed(1)}%` : "—"}</small></dd></div>)}</dl>{paymentTotal === 0 && <p className="monthly-finance__note">{t("本月暂无已录入的服务收款。", "No service payments recorded this month.")}</p>}</> : <p className="empty-state">{t("等待本月数据", "Waiting for monthly data")}</p>}
      </section>
    </div>
    <section className="monthly-finance__panel monthly-finance__comparison"><header><h2>{t("月度指标对照", "Monthly comparison")}</h2><p>{t("所选月及前两个月 · 相同统计口径，金额保留美分", "Selected month and the two preceding months · Consistent definitions and exact cents")}</p></header>
      <div className="monthly-finance__comparison-table"><table><thead><tr><th scope="col">{t("指标", "Metric")}</th>{periods.map(period => <th key={period.month} scope="col">{period.month}<small>{period.dateFrom.slice(5)} — {period.dateTo.slice(5)}</small></th>)}<th scope="col">{t("较上月", "vs. previous month")}</th></tr></thead><tbody>{monthlyRows.map(row => {
        const value = current?.totals[row.key], baseline = previous?.totals[row.key];
        return <tr key={row.key}><th scope="row">{row.label}</th>{[current, previous, earlierResult.data].map((data, index) => <td key={periods[index]!.month} data-label={`${periods[index]!.month} (${periods[index]!.dateFrom.slice(8)}–${periods[index]!.dateTo.slice(8)})`}>{valueText(data?.totals[row.key], row.count)}</td>)}<td data-label={t("较上月", "vs. previous month")}>{value != null && baseline != null ? changeText(value, baseline, row.count) : "—"}</td></tr>;
      })}</tbody></table></div><p className="monthly-finance__note">{t("日均营业额仅按各自范围内已日结天数计算；无日结显示 —。折扣和手续费增加仅表示金额变化。", "Average revenue uses each period’s closed days; no closed days shows —. Higher discounts or fees only indicate an amount change.")}</p>
    </section>
    <details className="monthly-finance__definitions"><summary>{t("查看财务口径", "Financial definitions")}</summary><p>{t("总流水＝折后大费＋礼物卡销售－礼物卡核销（大费和小费）。店铺收入沿用原有服务端口径，礼物卡净收支只计一次。总收入＝店铺收入＋店长记工收入＋经理记工收入－刷卡手续费，尚未扣除房租等固定支出。员工收入包含所有记工人员的大费工资和小费，不等于已发工资。", "Turnover = discounted service performance + gift card sales − gift card redemptions (service fees and tips). Store income follows existing server calculations, counting gift card net flows once. Total income = store income + owner service earnings + manager service earnings − card fees, before rent and other operating expenses. Employee earnings include service wages and tips for all service providers and do not represent wages already paid.")}</p></details>
    {current && children}
  </section>;
}
