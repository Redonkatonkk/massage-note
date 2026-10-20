"use client";

import { useAutoDismissState } from "../use-auto-dismiss-state";

import { AnalyticsDailyReport } from "./analytics-daily-report";
import { Chart } from "./analytics-chart";
import { AnalyticsAverageRevenue } from "./analytics-average-revenue";
import { AnalyticsIncomeBars } from "./analytics-income-bars";
import { AnalyticsWeekdayRevenue } from "./analytics-weekday-revenue";
import { visibleAnalyticsHours } from "./analytics-hours";
import { useEffect, useRef, useState } from "react";
import type { FinanceAnalyticsQuery, FinanceAnalyticsResponse } from "@massage-note/contracts";
import { apiRequest, errorMessage } from "../../lib/api";
import { LatestRequest } from "../../lib/latest-request";
import { createRefreshQueue } from "../../lib/refresh-queue";
import { useStoreRealtime } from "../../lib/realtime";
import { useLanguage } from "../language-provider";
import { shiftDate } from "./date-utils";

export function AnalyticsPanel({ storeId, today }: { storeId: string; today: string }) {
  const { locale } = useLanguage();
  const en = locale === "en-US";
  const t = (zh: string, english: string) => en ? english : zh;
  const [range, setRange] = useState({ from: "", to: "" });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [highlightFilter, setHighlightFilter] = useState<NonNullable<FinanceAnalyticsQuery["highlightFilter"]>>("ALL");
  const [result, setResult] = useState<{ scope: string; data: FinanceAnalyticsResponse } | null>(null);
  const [error, setError] = useAutoDismissState("");
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [cell, setCell] = useState("");
  const requests = useRef(new LatestRequest()).current;
  const scope = `${storeId}:${range.from}:${range.to}:${highlightFilter}`;
  requests.setScope(scope);
  const queue = useRef<ReturnType<typeof createRefreshQueue> | null>(null);
  useEffect(() => {
    const refresh = createRefreshQueue(async () => {
      const current = requests.begin();
      setLoading(true); setError(""); setLoadFailed(false);
      try {
        const params = new URLSearchParams({ highlightFilter });
        if (range.from) params.set("dateFrom", range.from);
        if (range.to) params.set("dateTo", range.to);
        const data = await apiRequest<FinanceAnalyticsResponse>(`/stores/${storeId}/finance/analytics?${params}`);
        if (current()) setResult({ scope, data });
      } catch (caught) { if (current()) { setLoadFailed(true); setError(errorMessage(caught)); } }
      finally { if (current()) setLoading(false); }
    });
    queue.current = refresh; setCell("");
    void refresh.request();
    return () => { refresh.dispose(); requests.begin(); };
  }, [storeId, range.from, range.to, highlightFilter, scope, requests]);
  useStoreRealtime(storeId, () => queue.current?.request());
  const data = result?.scope === scope ? result.data : null;
  const money = (cents: string | null) => cents === null ? "—" : new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(Number(cents) / 100);
  const dollars = (cents: string | null) => cents === null ? null : Number(cents) / 100;
  const names = en ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"];
  const select = (start: string, end: string) => { setFrom(start); setTo(end); setRange({ from: start, to: end }); };
  const count = (value: number) => t(`${value} 笔`, `${value} records`);
  const samples = (n: number) => t(`${n} 个已日结日`, `${n} closed days`);
  const visibleHours = visibleAnalyticsHours(data?.hours ?? []);
  const maxHeat = data ? Math.max(1, ...data.weekdays.flatMap(w => w.hours)) : 1;
  return <section className="finance-section analytics-panel">
    <form className="filter-panel" onSubmit={event => { event.preventDefault(); if (from && to) setRange({ from, to }); }}>
      <div className="filter-panel__heading"><div><strong>{t("经营分析", "Business analytics")}</strong><p>{t("全店数据 · 独立日期与高光筛选", "Store-wide data · Independent date and highlight filters")}</p></div></div>
      <div className="quick-ranges">{[["", "", t("全部", "All time")], [shiftDate(today, -6), today, t("最近7天", "Last 7 days")], [shiftDate(today, -29), today, t("最近30天", "Last 30 days")], [`${today.slice(0, 8)}01`, today, t("本月", "This month")]].map(([start, end, label]) => <button key={label} type="button" aria-pressed={range.from === start && range.to === end} onClick={() => select(start!, end!)}>{label}</button>)}</div>
      <label>{t("开始日期", "Start date")}<input type="date" required value={from} max={to || today} onChange={event => setFrom(event.target.value)} /></label>
      <label>{t("结束日期", "End date")}<input type="date" required value={to} min={from} max={today} onChange={event => setTo(event.target.value)} /></label>
      <label>{t("高光记工", "Highlighted records")}<select value={highlightFilter} onChange={event => setHighlightFilter(event.target.value as NonNullable<FinanceAnalyticsQuery["highlightFilter"]>)}><option value="ONLY_HIGHLIGHTED">{t("仅高光", "Highlighted only")}</option><option value="EXCLUDE_HIGHLIGHTED">{t("排除高光", "Exclude highlighted")}</option><option value="ALL">{t("全部", "All")}</option></select></label>
      <button className="primary-action" type="submit">{t("应用日期段", "Apply dates")}</button>
    </form>
    {loading && <p role="status">{t("正在更新图表…", "Updating charts…")}</p>}
    {loadFailed && <p className={error ? "form-error" : undefined} role={error ? "alert" : undefined}>{error} <button type="button" onClick={() => void queue.current?.request()}>{t("重试", "Retry")}</button></p>}
    {data && <><p>{data.dateFrom} — {data.dateTo} · {highlightFilter === "ONLY_HIGHLIGHTED" ? t("仅高光；数量含待结账记工，营业额只计已日结日期，扣除礼卡大费，不含卖卡实收与小费。", "Highlighted only; counts include pending payments. Revenue uses closed days, deducts gift-card service payments and excludes card sales and tips.") : t("数量含待结账记工；营业额只计已日结日期，含卖卡实收、扣除礼卡大费，不含小费。", "Counts include pending payments. Revenue uses closed days, includes card sales, deducts gift-card service payments and excludes tips.")} {t("跑客人数不受高光筛选影响。", "Lost customer counts are unaffected by the highlight filter.")}</p>
      {!data.hasData && <p className="empty-state">{t("当前范围没有经营数据。", "No business data in this range.")}</p>}
      <AnalyticsDailyReport key={`${scope}:${locale}`} storeId={storeId} data={data} highlightFilter={highlightFilter}>
      {income => <>
        {data.hasData && <Chart title={t("每日营业额趋势", "Daily revenue trend")} description={t("未日结留空；均线统计当日及此前6天内已日结日期。", "Open days are gaps. The average uses closed days within each trailing 7-day window.")} currency legend={t("深绿实线：营业额 · 蓝灰虚线：7日移动平均", "Green solid: revenue · Blue dashed: 7-day moving average")} points={data.days.map(d => ({ label: d.businessDate, value: dollars(d.revenueCents), secondary: dollars(d.averageCents), detail: `${d.businessDate} · ${t("营业额", "Revenue")} ${money(d.revenueCents)} · ${t("7日均线", "7-day average")} ${money(d.averageCents)} · ${samples(d.averageDayCount)}` }))} />}
        {(data.hasData || data.weekdayComparison.hasData) && <AnalyticsWeekdayRevenue data={data.weekdayComparison} />}
        {data.hasData && <>
        <AnalyticsIncomeBars {...income} dateFrom={data.dateFrom} dateTo={data.dateTo} />
        <AnalyticsAverageRevenue data={data} />
        <Chart title={t("按小时上工数量", "Service starts by hour")} description={t("仅显示所选日期内最早至最晚上工小时，中间空小时保留；选择图中时段后，展开记工明细查看该时段每天的笔数，隐藏 0 笔日期。", "Hours span the earliest to latest service starts in the selected dates, including empty hours between. Select an hour, then expand its record details to see dates with service starts.")} points={visibleHours.map(h => ({ label: `${h.hour}:00`, value: h.count, detail: `${h.hour}:00–${h.hour}:59 · ${count(h.count)}`, dailyDetails: data.days.map(day => ({ date: day.businessDate, count: day.hours[h.hour] ?? 0 })) }))} />
        <Chart title={t("每日记工数量", "Daily service count")} description={t("按营业日统计；柱顶数字为记工笔数，+数字为跑客人数；跑客叠加在记工上方，无跑客时不显示。", "Counts by business day. Bar labels show service records; + labels show lost customers stacked above them and are hidden when zero.")} legend={data.days.some(d => d.lostCustomerCount > 0) ? t("深绿：记工 · 红色：跑客（+数字）", "Green: service records · Red: lost customers (+ labels)") : undefined} bars points={data.days.map(d => ({ label: d.businessDate, value: d.count, lostCount: d.lostCustomerCount, detail: `${d.businessDate} · ${t("记工", "Service records")} ${count(d.count)}${d.lostCustomerCount > 0 ? t(` · 跑客 ${d.lostCustomerCount} 位`, ` · ${d.lostCustomerCount} lost ${d.lostCustomerCount === 1 ? "customer" : "customers"}`) : ""}` }))} />
        <section className="analytics-card analytics-heatmap"><h2>{t("星期 × 小时热力图", "Weekday × hour heatmap")}</h2><p className="analytics-description">{t("显示实际最早至最晚上工小时；颜色越深，累计笔数越多；括号内为自然日数。", "Actual earliest-to-latest start hours. Darker cells mean more starts; parentheses show calendar days.")}</p>
          {visibleHours.length === 0 && <p className="empty-state">{t("当前范围没有记工。", "No service records in this range.")}</p>}
          <div className="analytics-scroll"><table className="analytics-heat-table" style={{ minWidth: Math.max(300, 120 + visibleHours.length * 34) }}><thead><tr><th>{t("累计笔数", "Total starts")}</th>{visibleHours.map(h => <th key={h.hour}>{h.hour}</th>)}</tr></thead><tbody>{data.weekdays.map(w => <tr key={w.weekday}><th>{names[w.weekday]} ({w.calendarDayCount})</th>{visibleHours.map(({ hour }) => { const n = w.hours[hour]!; const detail = `${names[w.weekday]} ${hour}:00–${hour}:59 · ${count(n)} · ${w.calendarDayCount} ${t("个自然日", "calendar days")}`; return <td key={hour}><button type="button" title={detail} aria-label={detail} onFocus={() => setCell(detail)} onClick={() => setCell(detail)} style={{ background: `color-mix(in srgb, var(--brand) ${6 + n / maxHeat * 54}%, var(--surface))`, color: "var(--ink)" }}>{n}</button></td>; })}</tr>)}</tbody></table></div>
          <p className="analytics-readout" aria-live="polite">{cell || t("点击色块查看累计笔数。", "Tap a cell to see total starts.")}</p>
          <p>{t("浅色 → 深色", "Light → Dark")} · 0–{maxHeat} {t("笔", "starts")}</p>
        </section>
        </>}
      </>}
      </AnalyticsDailyReport>
    </>}
  </section>;
}
