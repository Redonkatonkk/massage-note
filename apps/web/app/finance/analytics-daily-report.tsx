"use client";

import { useEffect, useRef, useState } from "react";
import type { FinanceAnalyticsQuery, FinanceAnalyticsResponse } from "@massage-note/contracts";
import { apiRequest, errorMessage } from "../../lib/api";
import { LatestRequest } from "../../lib/latest-request";
import { formatUsd } from "../../lib/money";
import { createRefreshQueue } from "../../lib/refresh-queue";
import { useStoreRealtime } from "../../lib/realtime";
import type { FinanceDetailsResponse, FinanceSummaryResponse } from "../../lib/types";
import { useLanguage } from "../language-provider";
import { useAutoDismissState } from "../use-auto-dismiss-state";
import { AnalyticsRevenueCalendar } from "./analytics-revenue-calendar";
import { FinanceDetailsDialog } from "./finance-details-dialog";

const amountColumns = [
  ["mainServiceAmountCents", "主要项目", "Main services"],
  ["addonTotalCents", "加项", "Add-ons"],
  ["grossFeeBaseCents", "大费基数", "Fee base"],
  ["discountTotalCents", "折扣", "Discounts"],
  ["discountedFeePerformanceCents", "折后大费", "Fees after discounts"],
  ["giftCardSalesAmountCents", "礼物卡销售", "Gift card sales"],
  ["giftCardRedemptionCents", "礼物卡核销支出", "Gift card redemption expense"],
  ["employeeIncomeCents", "员工总收入", "Employee earnings"],
  ["storeIncomeCents", "店铺收入", "Store income"],
  ["totalIncomeCents", "总收入", "Total income"],
] as const;

export function AnalyticsDailyReport({ storeId, data, highlightFilter }: {
  storeId: string;
  data: FinanceAnalyticsResponse;
  highlightFilter: NonNullable<FinanceAnalyticsQuery["highlightFilter"]>;
}) {
  const { locale } = useLanguage();
  const en = locale === "en-US";
  const t = (zh: string, english: string) => en ? english : zh;
  const { dateFrom, dateTo } = data;
  const scope = `${storeId}:${dateFrom}:${dateTo}:${highlightFilter}`;
  const [result, setResult] = useState<{ scope: string; days: FinanceSummaryResponse["days"] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useAutoDismissState("");
  const [expanded, setExpanded] = useState(false);
  const [target, setTarget] = useState<{ scope: string; date: string; label: string } | null>(null);
  const [details, setDetails] = useState<{ scope: string; data: FinanceDetailsResponse } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailFailed, setDetailFailed] = useState(false);
  const [detailError, setDetailError] = useAutoDismissState("");
  const requests = useRef(new LatestRequest()).current;
  requests.setScope(scope);
  const detailScope = target?.scope === scope ? `${scope}:${target.date}:${target.label}` : "";
  const detailRequests = useRef(new LatestRequest()).current;
  detailRequests.setScope(detailScope);
  const queue = useRef<ReturnType<typeof createRefreshQueue> | null>(null);
  const detailQueue = useRef<ReturnType<typeof createRefreshQueue> | null>(null);

  useEffect(() => {
    const refresh = createRefreshQueue(async () => {
      const current = requests.begin();
      setLoading(true); setFailed(false); setError("");
      try {
        const params = new URLSearchParams({ dateFrom, dateTo, highlightFilter, paymentMethod: "ALL", amountType: "ALL" });
        const summary = await apiRequest<FinanceSummaryResponse>(`/stores/${storeId}/finance/summary?${params}`);
        if (current()) setResult({ scope, days: summary.days });
      } catch (caught) { if (current()) { setFailed(true); setError(errorMessage(caught)); } }
      finally { if (current()) setLoading(false); }
    });
    queue.current = refresh;
    void refresh.request();
    return () => { refresh.dispose(); requests.begin(); };
  }, [storeId, dateFrom, dateTo, highlightFilter, scope, requests]);

  useEffect(() => {
    setDetails(null); setDetailError(""); setDetailFailed(false); setDetailLoading(false);
    if (!detailScope || !target) { detailQueue.current = null; return; }
    const refresh = createRefreshQueue(async () => {
      const current = detailRequests.begin();
      setDetailLoading(true); setDetailFailed(false); setDetailError("");
      try {
        const params = new URLSearchParams({ dateFrom: target.date, dateTo: target.date, highlightFilter, paymentMethod: "ALL", amountType: "ALL" });
        const response = await apiRequest<FinanceDetailsResponse>(`/stores/${storeId}/finance/details?${params}`);
        if (current()) setDetails({ scope: detailScope, data: response });
      } catch (caught) { if (current()) { setDetailFailed(true); setDetailError(errorMessage(caught)); } }
      finally { if (current()) setDetailLoading(false); }
    });
    detailQueue.current = refresh;
    void refresh.request();
    return () => { refresh.dispose(); detailRequests.begin(); };
  }, [storeId, target, highlightFilter, detailScope, detailRequests]);

  useStoreRealtime(storeId, async () => { await Promise.all([queue.current?.request(), detailQueue.current?.request()]); });
  const days = result?.scope === scope ? result.days : [];
  const viewDetails = (date: string, label: string) => setTarget({ scope, date, label });
  const amount = (date: string, cents: number, label: string) => <button className="amount-link" type="button" disabled={detailLoading} aria-label={`${date} ${label} · ${t("查看组成明细", "View breakdown")}`} onClick={() => viewDetails(date, `${date} ${label}`)}>{formatUsd(cents, locale)}</button>;
  return <>
    <AnalyticsRevenueCalendar key={scope} data={data} disabled={detailLoading} onDate={date => viewDetails(date, `${date} ${t("营业额", "Revenue")}`)} />
    {detailLoading && <p role="status">{t("正在读取当天明细…", "Loading daily details…")}</p>}
    {detailFailed && <p role={detailError ? "alert" : "status"} className={detailError ? "form-error" : undefined}>{detailError} <button type="button" className="secondary-action" onClick={() => void detailQueue.current?.request()}>{t("重试", "Retry")}</button></p>}
    <section className="finance-report-section" aria-busy={loading}>
      <div className="finance-report-heading">
        <div><h2>{t("每日小计", "Daily subtotals")}</h2><p>{t("按当前日期与高光筛选，点击金额查看当天明细；过去30天平均营业额为全店参考。", "Follows the selected dates and highlight filter. Select an amount for details; the trailing 30-day average is a store-wide reference.")}</p></div>
        <button className="secondary-action" type="button" aria-pressed={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? t("只看主要金额", "Main amounts only") : t("显示全部列", "Show all columns")}</button>
      </div>
      {loading && <p role="status">{t("正在读取每日小计…", "Loading daily subtotals…")}</p>}
      {failed ? <p role={error ? "alert" : "status"} className={error ? "form-error" : undefined}>{error} <button type="button" className="secondary-action" onClick={() => void queue.current?.request()}>{t("重试", "Retry")}</button></p> : result?.scope === scope && days.length === 0 ? <p className="empty-state">{t("当前筛选没有每日小计。", "No daily subtotals match these filters.")}</p> : days.length > 0 && <div className="table-scroll">
        <table className={`data-table finance-daily-table${expanded ? " is-expanded" : ""}`}>
          <thead><tr><th>{t("日期", "Date")}</th><th>{t("星期", "Weekday")}</th><th>{t("今日流水", "Daily turnover")}</th><th>{t("过去30天平均营业额", "Trailing 30-day average revenue")}</th>{amountColumns.map(([key, zh, english]) => <th key={key}>{t(zh, english)}</th>)}</tr></thead>
          <tbody>{days.map(row => <tr key={row.businessDate}>
            <td>{row.businessDate}</td>
            <td>{new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(new Date(`${row.businessDate}T00:00:00.000Z`))}</td>
            <td>{amount(row.businessDate, row.dailyTurnoverCents, t("今日流水", "Daily turnover"))}</td>
            <td>{row.recentClosedRevenue ? <span title={t(`过去${row.recentClosedRevenue.dayCount}天平均营业额`, `Average revenue over ${row.recentClosedRevenue.dayCount} closed days`)}>{formatUsd(row.recentClosedRevenue.averageCents, locale)}</span> : "—"}</td>
            {amountColumns.map(([key, zh, english]) => <td key={key}>{amount(row.businessDate, row[key], t(zh, english))}</td>)}
          </tr>)}</tbody>
        </table>
      </div>}
    </section>
    {details?.scope === detailScope && target && <FinanceDetailsDialog details={details.data} title={target.label} onClose={() => setTarget(null)} />}
  </>;
}
