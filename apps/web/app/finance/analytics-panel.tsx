"use client";

import { visibleAnalyticsHours } from "./analytics-hours";
import { useEffect, useRef, useState } from "react";
import type { FinanceAnalyticsResponse } from "@massage-note/contracts";
import { apiRequest, errorMessage } from "../../lib/api";
import { LatestRequest } from "../../lib/latest-request";
import { createRefreshQueue } from "../../lib/refresh-queue";
import { useStoreRealtime } from "../../lib/realtime";
import { useLanguage } from "../language-provider";
import { shiftDate } from "./date-utils";

type Point = { label: string; value: number | null; secondary?: number | null; lostCount?: number; detail: string; dailyDetails?: { date: string; count: number }[] };

function Chart({ title, description, points, bars = false, currency = false, legend }: {
  title: string; description: string; points: Point[]; bars?: boolean; currency?: boolean; legend?: string | undefined;
}) {
  const { locale } = useLanguage();
  const en = locale === "en-US";
  const [selected, setSelected] = useState<string | null>(null);
  const selectedPoint = points.find(point => point.label === selected);
  const width = Math.max(600, points.length * 26 + 80);
  const height = 270, left = 65, right = width - 20, bottom = 225, top = 20;
  const max = Math.max(1, ...points.flatMap(p => [(p.value ?? 0) + (bars ? p.lostCount ?? 0 : 0), p.secondary ?? 0]));
  const ceiling = currency ? Math.ceil(max / 5) * 5 : Math.max(4, Math.ceil(max / 4) * 4);
  const x = (i: number) => left + (i + .5) * (right - left) / Math.max(1, points.length);
  const y = (value: number) => bottom - value / ceiling * (bottom - top);
  const path = (secondary: boolean) => {
    let connected = false;
    return points.map((point, i) => {
      const value = secondary ? point.secondary : point.value;
      if (value == null) { connected = false; return ""; }
      const command = connected ? "L" : "M"; connected = true;
      return `${command}${x(i)},${y(value)}`;
    }).join(" ");
  };
  return <section className="analytics-card">
    <h2>{title}</h2><p className="analytics-description">{description}</p>
    {legend && <p className="analytics-legend">{legend}</p>}
    {points.length === 0 && <p className="empty-state">{en ? "No service records in this range." : "当前范围没有记工。"}</p>}
    <div className="analytics-scroll" tabIndex={0} aria-label={title}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label={title}>
        {Array.from({ length: 5 }, (_, i) => { const value = ceiling * i / 4; return <g key={i}>
          <line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="#e4ddd4" />
          <text x={left - 8} y={y(value) + 4} textAnchor="end">{currency ? `$${Math.round(value)}` : value}</text>
        </g>; })}
        {!bars && <><path d={path(false)} fill="none" stroke="#9a4b25" strokeWidth="2.5" /><path d={path(true)} fill="none" stroke="#287e79" strokeWidth="2.5" strokeDasharray="6 4" /></>}
        {points.map((point, i) => <g key={point.label}>
          {point.value !== null && (bars ? <rect x={x(i) - Math.min(22, (right - left) / points.length * .32)} y={y(point.value)} width={Math.min(44, (right - left) / points.length * .64)} height={bottom - y(point.value)} fill="#ad603a" rx="3" /> : <circle cx={x(i)} cy={y(point.value)} r="3" fill="#9a4b25" />)}
          {bars && (point.lostCount ?? 0) > 0 && <g data-lost-count={point.lostCount}>
            <rect x={x(i) - Math.min(22, (right - left) / points.length * .32)} y={y((point.value ?? 0) + point.lostCount!)} width={Math.min(44, (right - left) / points.length * .64)} height={y(point.value ?? 0) - y((point.value ?? 0) + point.lostCount!)} fill="#c65f60" rx="2" />
            <text className="analytics-lost-count" x={x(i)} y={y((point.value ?? 0) + point.lostCount!) - 5} textAnchor="middle">+{point.lostCount}</text>
          </g>}
          {bars && point.value === null && <text x={x(i)} y={bottom - 8} textAnchor="middle">—</text>}
          {point.secondary != null && <circle cx={x(i)} cy={y(point.secondary)} r="2.5" fill="#287e79" />}
          {(i % Math.max(1, Math.ceil(points.length / (width / 75))) === 0 || i === points.length - 1) && <text x={x(i)} y={bottom + 23} textAnchor="middle">{point.label.length === 10 ? point.label.slice(5) : point.label}</text>}
          <rect className="analytics-hit" x={x(i) - (right - left) / points.length / 2} y={top} width={(right - left) / points.length} height={bottom - top} fill="transparent" tabIndex={0} role="button" aria-label={point.detail}
            onMouseEnter={() => setSelected(point.label)} onFocus={() => setSelected(point.label)} onClick={() => setSelected(point.label)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(point.label); } }}><title>{point.detail}</title></rect>
        </g>)}
      </svg>
    </div>
    <p className="analytics-readout" aria-live="polite">{selectedPoint ? selectedPoint.detail : en ? "Tap or focus a point to see its value." : "点击或聚焦图中位置查看具体数值。"}</p>
    {points.some(point => point.dailyDetails !== undefined) ? <details className="hourly-details">
      <summary>{en ? "Selected hour record details" : "我选择的时段记工明细"}<span>{en ? "Dates with service starts only" : "仅显示有上工的日期"}</span></summary>
      <div className="hourly-details__list">
        {!selectedPoint && <p className="hourly-details__empty">{en ? "Select an hour in the chart to see its daily records." : "请先在图表中选择时段，查看该时段每天的记工笔数。"}</p>}
        {(selectedPoint ? [selectedPoint] : []).map(point => {
          const activeDays = point.dailyDetails?.filter(day => day.count > 0) ?? [];
          return <section className="hourly-details__period" key={point.label} aria-label={point.detail}>
            <header><h3>{point.label}–{point.label.replace(":00", ":59")}</h3><span>{en ? "Total" : "合计"} <strong>{point.value}</strong> {en ? "records" : "笔"}</span></header>
            {activeDays.length > 0 ? <ul>{activeDays.map(day => <li key={day.date}>
              <time dateTime={day.date}>{day.date}</time><strong>{day.count}<small>{en ? "records" : "笔"}</small></strong>
            </li>)}</ul> : <p className="hourly-details__empty">{en ? "No service starts in this hour" : "此时段暂无上工"}</p>}
          </section>;
        })}
      </div>
    </details> : <details><summary>{en ? "View data table" : "查看数据表"}</summary><div className="table-scroll"><table className="data-table"><thead><tr><th>{en ? "Period" : "时间"}</th><th>{en ? "Details" : "统计明细"}</th></tr></thead><tbody>{points.map(p => <tr key={p.label}><td>{p.label}</td><td>{p.detail}</td></tr>)}</tbody></table></div></details>}
  </section>;
}

export function AnalyticsPanel({ storeId, today }: { storeId: string; today: string }) {
  const { locale } = useLanguage();
  const en = locale === "en-US";
  const t = (zh: string, english: string) => en ? english : zh;
  const [range, setRange] = useState({ from: "", to: "" });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [result, setResult] = useState<{ scope: string; data: FinanceAnalyticsResponse } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [cell, setCell] = useState("");
  const requests = useRef(new LatestRequest()).current;
  const scope = `${storeId}:${range.from}:${range.to}`;
  requests.setScope(scope);
  const queue = useRef<ReturnType<typeof createRefreshQueue> | null>(null);
  useEffect(() => {
    const refresh = createRefreshQueue(async () => {
      const current = requests.begin();
      setLoading(true); setError("");
      try {
        const params = new URLSearchParams();
        if (range.from) params.set("dateFrom", range.from);
        if (range.to) params.set("dateTo", range.to);
        const data = await apiRequest<FinanceAnalyticsResponse>(`/stores/${storeId}/finance/analytics?${params}`);
        if (current()) setResult({ scope, data });
      } catch (caught) { if (current()) setError(errorMessage(caught)); }
      finally { if (current()) setLoading(false); }
    });
    queue.current = refresh; setCell("");
    void refresh.request();
    return () => { refresh.dispose(); requests.begin(); };
  }, [storeId, range.from, range.to, scope, requests]);
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
      <div className="filter-panel__heading"><div><strong>{t("经营分析", "Business analytics")}</strong><p>{t("全店数据 · 独立日期筛选", "Store-wide data · Independent date range")}</p></div></div>
      <div className="quick-ranges">{[["", "", t("全部", "All time")], [shiftDate(today, -6), today, t("最近7天", "Last 7 days")], [shiftDate(today, -29), today, t("最近30天", "Last 30 days")], [`${today.slice(0, 8)}01`, today, t("本月", "This month")]].map(([start, end, label]) => <button key={label} type="button" aria-pressed={range.from === start && range.to === end} onClick={() => select(start!, end!)}>{label}</button>)}</div>
      <label>{t("开始日期", "Start date")}<input type="date" required value={from} max={to || today} onChange={event => setFrom(event.target.value)} /></label>
      <label>{t("结束日期", "End date")}<input type="date" required value={to} min={from} max={today} onChange={event => setTo(event.target.value)} /></label>
      <button className="primary-action" type="submit">{t("应用日期段", "Apply dates")}</button>
    </form>
    {loading && <p role="status">{t("正在更新图表…", "Updating charts…")}</p>}
    {error && <p className="form-error" role="alert">{error} <button type="button" onClick={() => void queue.current?.request()}>{t("重试", "Retry")}</button></p>}
    {data && <><p>{data.dateFrom} — {data.dateTo} · {t("数量含待结账记工；营业额只计已日结日期，含卖卡实收、不含小费。", "Counts include pending payments. Revenue includes only closed days, including card sales and excluding tips.")}</p>
      {!data.hasData ? <p className="empty-state">{t("当前范围没有经营数据。", "No business data in this range.")}</p> : <div className="analytics-grid" key={`${scope}:${locale}`}>
        <Chart title={t("按小时上工数量", "Service starts by hour")} description={t("仅显示所选日期内最早至最晚上工小时，中间空小时保留；选择图中时段后，展开记工明细查看该时段每天的笔数，隐藏 0 笔日期。", "Hours span the earliest to latest service starts in the selected dates, including empty hours between. Select an hour, then expand its record details to see dates with service starts.")} points={visibleHours.map(h => ({ label: `${h.hour}:00`, value: h.count, detail: `${h.hour}:00–${h.hour}:59 · ${count(h.count)}`, dailyDetails: data.days.map(day => ({ date: day.businessDate, count: day.hours[h.hour] ?? 0 })) }))} />
        <Chart title={t("每日记工数量", "Daily service count")} description={t("按营业日统计；跑客数量叠加在记工上方，无跑客时不显示。", "Counts by business day. Lost customers stack above service records and are hidden when zero.")} legend={data.days.some(d => d.lostCustomerCount > 0) ? t("棕色：记工 · 红色：跑客（上方数字）", "Brown: service records · Red: lost customers (number above)") : undefined} bars points={data.days.map(d => ({ label: d.businessDate, value: d.count, lostCount: d.lostCustomerCount, detail: `${d.businessDate} · ${t("记工", "Service records")} ${count(d.count)}${d.lostCustomerCount > 0 ? t(` · 跑客 ${d.lostCustomerCount} 位`, ` · ${d.lostCustomerCount} lost ${d.lostCustomerCount === 1 ? "customer" : "customers"}`) : ""}` }))} />
        <Chart title={t("星期平均营业额", "Average revenue by weekday")} description={t("只统计已日结日期；空日结计零，没有样本显示破折号。", "Closed days only; empty closed days count as zero. No sample is shown as a dash.")} bars currency points={data.weekdays.map(w => ({ label: names[w.weekday]!, value: dollars(w.averageCents), detail: `${names[w.weekday]} · ${money(w.averageCents)} · ${samples(w.closedDayCount)}` }))} />
        <Chart title={t("每日营业额趋势", "Daily revenue trend")} description={t("未日结留空；均线统计当日及此前6天内已日结日期。", "Open days are gaps. The average uses closed days within each trailing 7-day window.")} currency legend={t("棕色实线：营业额 · 绿色虚线：7日移动平均", "Brown solid: revenue · Green dashed: 7-day moving average")} points={data.days.map(d => ({ label: d.businessDate, value: dollars(d.revenueCents), secondary: dollars(d.averageCents), detail: `${d.businessDate} · ${t("营业额", "Revenue")} ${money(d.revenueCents)} · ${t("7日均线", "7-day average")} ${money(d.averageCents)} · ${samples(d.averageDayCount)}` }))} />
        <section className="analytics-card analytics-heatmap"><h2>{t("星期 × 小时热力图", "Weekday × hour heatmap")}</h2><p className="analytics-description">{t("显示实际最早至最晚上工小时；颜色越深，累计笔数越多；括号内为自然日数。", "Actual earliest-to-latest start hours. Darker cells mean more starts; parentheses show calendar days.")}</p>
          {visibleHours.length === 0 && <p className="empty-state">{t("当前范围没有记工。", "No service records in this range.")}</p>}
          <div className="analytics-scroll"><table className="analytics-heat-table" style={{ minWidth: Math.max(300, 120 + visibleHours.length * 34) }}><thead><tr><th>{t("累计笔数", "Total starts")}</th>{visibleHours.map(h => <th key={h.hour}>{h.hour}</th>)}</tr></thead><tbody>{data.weekdays.map(w => <tr key={w.weekday}><th>{names[w.weekday]} ({w.calendarDayCount})</th>{visibleHours.map(({ hour }) => { const n = w.hours[hour]!; const detail = `${names[w.weekday]} ${hour}:00–${hour}:59 · ${count(n)} · ${w.calendarDayCount} ${t("个自然日", "calendar days")}`; return <td key={hour}><button type="button" title={detail} aria-label={detail} onFocus={() => setCell(detail)} onClick={() => setCell(detail)} style={{ background: `rgba(154, 75, 37, ${.06 + n / maxHeat * .88})`, color: n / maxHeat > .5 ? "white" : "#503723" }}>{n}</button></td>; })}</tr>)}</tbody></table></div>
          <p className="analytics-readout" aria-live="polite">{cell || t("点击色块查看累计笔数。", "Tap a cell to see total starts.")}</p>
          <p>{t("浅色 → 深色", "Light → Dark")} · 0–{maxHeat} {t("笔", "starts")}</p>
        </section>
      </div>}
    </>}
  </section>;
}
