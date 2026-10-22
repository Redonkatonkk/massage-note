"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLanguage } from "../language-provider";
import { smoothChartPath } from "./analytics-curve";
import { AnalyticsHorizontalBars } from "./analytics-horizontal-bars";

export type ChartPoint = { label: string; value: number | null; secondary?: number | null; lostCount?: number; detail: string; dailyDetails?: { date: string; count: number }[]; dailyRevenueDetails?: { date: string; revenue: string; revenues?: string[] }[] };

export type ChartSeries = { id: string; label?: string; color: string; dash?: string; values: (number | null)[] };

export function Chart({ title, description, points, bars = false, horizontalBars = false, currency = false, legend, series, controls, className = "", fitToData = false, scrollLabel }: {
  title: string; description: string; points: ChartPoint[]; bars?: boolean; currency?: boolean; legend?: string | undefined;
  series?: ChartSeries[]; controls?: ReactNode; className?: string; horizontalBars?: boolean; fitToData?: boolean; scrollLabel?: string;
}) {
  const { locale } = useLanguage();
  const en = locale === "en-US";
  const [selected, setSelected] = useState<string | null>(null);
  const selectedPoint = points.find(point => point.label === selected);
  const [revenueSelection, setRevenueSelection] = useState<string | null>(null);
  const revenuePoint = points.find(point => point.label === revenueSelection);
  const revenueTable = useRef<HTMLDetailsElement>(null);
  const activate = (point: ChartPoint) => {
    setSelected(point.label);
    if (point.dailyRevenueDetails !== undefined) {
      setRevenueSelection(point.label);
      if (revenueTable.current) revenueTable.current.open = true;
    }
  };
  const plot = useRef<HTMLDivElement>(null);
  const [plotWidth, setPlotWidth] = useState(600);
  const groupedBars = bars && series !== undefined;
  useEffect(() => {
    if (!plot.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setPlotWidth(horizontalBars ? entry.contentRect.width : Math.max(240, entry.contentRect.width));
    });
    observer.observe(plot.current);
    return () => observer.disconnect();
  }, [horizontalBars]);
  const curves: ChartSeries[] = series ?? [
    { id: "primary", color: "var(--brand)", values: points.map(point => point.value) },
    { id: "secondary", color: "var(--chart-secondary)", dash: "6 4", values: points.map(point => point.secondary ?? null) },
  ];
  const number = new Intl.NumberFormat(locale, currency ? { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", minimumFractionDigits: 0, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 });
  const label = (value: number | null | undefined) => value == null ? "—" : number.format(value);
  const values = groupedBars ? curves.flatMap(curve => curve.values) : points.map(point => point.value);
  const valueWidth = Math.max(36, ...values.map(value => label(value).length * 9 + 16));
  const categoryWidth = Math.max(60, ...points.map(point => (point.label.length === 10 ? 5 : point.label.length) * 9 + 16));
  const groupWidth = Math.max(categoryWidth, groupedBars ? curves.length * valueWidth + 16 : valueWidth);
  const width = bars ? Math.max(plotWidth, points.length * groupWidth + 85) : plotWidth;
  let minimum = Infinity;
  let peak: { curve: ChartSeries; index: number; value: number } | null = null;
  if (fitToData && !bars) {
    for (const curve of curves) for (const [index, value] of curve.values.entries()) {
      if (value == null || !Number.isFinite(value)) continue;
      minimum = Math.min(minimum, value);
      if (peak === null || value > peak.value) peak = { curve, index, value };
    }
  }
  const max = bars && !groupedBars ? points.reduce((max, point) => Math.max(max, (point.value ?? 0) + (point.lostCount ?? 0)), 1)
    : curves.reduce((max, curve) => curve.values.reduce<number>((max, value) => Math.max(max, value ?? 0), max), 1);
  const min = curves.reduce((min, curve) => curve.values.reduce<number>((min, value) => Math.min(min, value ?? 0), min), 0);
  const height = bars ? 310 : 270;
  const bottom = bars ? 250 : 225, top = bars ? 44 : 20;
  const floor = peak ? minimum : currency ? Math.floor(min / 5) * 5 : Math.floor(min);
  // A single value or flat series still needs a nonzero plotting span.
  const ceiling = peak ? (peak.value > minimum ? peak.value : minimum + Math.max(1, Math.abs(minimum) * .05))
    : currency ? Math.ceil(max / 5) * 5 : Math.max(4, Math.ceil(max / 4) * 4);
  const left = peak ? Math.max(65, Math.max(label(floor).length, label(ceiling).length) * 7 + 12) : 65;
  const right = width - 20;
  const seriesSlot = (right - left) / Math.max(1, points.length * curves.length);
  const x = (i: number) => left + (i + .5) * (right - left) / Math.max(1, points.length);
  const y = (value: number) => bottom - (value - floor) / (ceiling - floor) * (bottom - top);
  const labelCount = Math.min(points.length, Math.max(2, Math.floor((right - left) / 75)));
  const labelIndices = new Set(Array.from({ length: labelCount }, (_, index) => Math.round(index * (points.length - 1) / Math.max(1, labelCount - 1))));
  const tickCount = peak && currency ? Math.min(5, Math.max(2, Math.round((ceiling - floor) * 100) + 1)) : 5;
  return <section className={`analytics-card ${className}`.trim()} aria-label={scrollLabel} tabIndex={scrollLabel ? 0 : undefined}>
    <h2>{title}</h2><p className="analytics-description">{description}</p>
    {legend && <p className="analytics-legend">{legend}</p>}
    {controls}
    {points.length === 0 && <p className="empty-state">{en ? "No service records in this range." : "当前范围没有记工。"}</p>}
    <div className={horizontalBars ? "analytics-plot analytics-horizontal-bars" : bars ? "analytics-scroll" : "analytics-plot"} ref={plot} tabIndex={0} aria-label={title}>
      {horizontalBars ? <AnalyticsHorizontalBars points={points} series={curves} width={plotWidth} valueWidth={valueWidth} label={label} selected={revenueSelection} inspect={point => setSelected(point.label)} activate={activate} /> : <svg width={bars ? width : "100%"} height={height} viewBox={`0 0 ${width} ${height}`} aria-label={title}>
        {Array.from({ length: tickCount }, (_, i) => { const value = floor + (ceiling - floor) * i / (tickCount - 1); return <g key={i}>
          <line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="var(--line)" />
          <text className="analytics-y-label" x={left - 8} y={y(value) + 4} textAnchor="end">{peak ? label(value) : currency ? `$${Math.round(value)}` : value}</text>
        </g>; })}
        {!bars && curves.map(curve => <path key={curve.id} data-series={curve.id} d={smoothChartPath(curve.values, x, y)} fill="none" stroke={curve.color} strokeWidth="2.5" strokeDasharray={curve.dash} />)}
        {groupedBars && <line className="analytics-zero-line" x1={left} x2={right} y1={y(0)} y2={y(0)} stroke="var(--muted)" />}
        {points.map((point, i) => <g key={point.label}>
          {groupedBars && curves.map((curve, seriesIndex) => {
            const value = curve.values[i];
            const center = x(i) + (seriesIndex - (curves.length - 1) / 2) * seriesSlot;
            const barWidth = Math.min(28, seriesSlot * .65);
            const labelY = value != null && value < 0 ? y(value) + 18 : y(value ?? 0) - 8;
            return <g key={curve.id}>
              {value != null && <rect data-series={curve.id} x={center - barWidth / 2} y={Math.min(y(value), y(0))} width={barWidth} height={Math.abs(y(value) - y(0))} fill={curve.color} rx="1" />}
              <text className="analytics-bar-value" data-series={curve.id} x={center} y={labelY} textAnchor="middle">{label(value)}</text>
            </g>;
          })}
          {bars && !groupedBars && point.value !== null && <>
            <rect x={x(i) - Math.min(22, (right - left) / points.length * .32)} y={y(point.value)} width={Math.min(44, (right - left) / points.length * .64)} height={bottom - y(point.value)} fill="var(--brand)" rx="3" />
            <text className="analytics-bar-value" x={x(i)} y={y(point.value + (point.lostCount ?? 0)) - ((point.lostCount ?? 0) > 0 ? 25 : 8)} textAnchor="middle">{label(point.value)}</text>
          </>}
          {bars && (point.lostCount ?? 0) > 0 && <g data-lost-count={point.lostCount}>
            <rect x={x(i) - Math.min(22, (right - left) / points.length * .32)} y={y((point.value ?? 0) + point.lostCount!)} width={Math.min(44, (right - left) / points.length * .64)} height={y(point.value ?? 0) - y((point.value ?? 0) + point.lostCount!)} fill="var(--chart-loss)" rx="2" />
            <text className="analytics-bar-value analytics-lost-count" x={x(i)} y={y((point.value ?? 0) + point.lostCount!) - 8} textAnchor="middle">+{point.lostCount}</text>
          </g>}
          {bars && !groupedBars && point.value === null && <text x={x(i)} y={bottom - 8} textAnchor="middle">—</text>}
          {!bars && curves.map(curve => curve.values[i] != null && <circle key={curve.id} cx={x(i)} cy={y(curve.values[i]!)} r={points.length > 90 ? 1.5 : 2.5} fill={curve.color} />)}
          {(bars || labelIndices.has(i)) && <text className="analytics-axis-label" x={x(i)} y={bottom + (bars ? 44 : 23)} textAnchor="middle">{point.label.length === 10 ? point.label.slice(5) : point.label}</text>}
          <rect className="analytics-hit" x={x(i) - (right - left) / points.length / 2} y={top} width={(right - left) / points.length} height={bottom - top + (point.dailyRevenueDetails !== undefined ? (bars ? 55 : 35) : 0)} fill="transparent" tabIndex={0} role="button" aria-label={point.detail} aria-pressed={point.dailyRevenueDetails !== undefined ? revenueSelection === point.label : undefined}
            onMouseEnter={() => setSelected(point.label)} onFocus={() => setSelected(point.label)} onClick={() => activate(point)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(point); } }}><title>{point.detail}</title></rect>
        </g>)}
        {peak && <circle className="analytics-peak-point" data-series={peak.curve.id} cx={x(peak.index)} cy={y(peak.value)} r="5" fill="var(--surface)" stroke={peak.curve.color} strokeWidth="2.5" pointerEvents="none" aria-hidden="true" />}
      </svg>}
    </div>
    {peak && <p className="analytics-description analytics-peak" role="status">{en ? "Highest average revenue" : "最高平均营业额"} <strong>{label(peak.value)}</strong> · {points[peak.index]?.label} · {peak.curve.label}</p>}
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
    </details> : points.some(point => point.dailyRevenueDetails !== undefined) ? <details className="weekday-revenue-details" ref={revenueTable}>
      <summary>{en ? "View data table" : "查看数据表"}{revenuePoint && ` · ${revenuePoint.label}`}</summary>
      {!revenuePoint ? <p className="empty-state">{en ? "Select a weekday in the chart to see its daily revenue." : "点击图中的星期，查看该星期各日期的营业额。"}</p> : revenuePoint.dailyRevenueDetails?.length === 0 ? <p className="empty-state">{en ? "No dates for this weekday in the selected range." : "当前范围没有该星期的日期。"}</p> : <div className="table-scroll" aria-live="polite"><table className="data-table">
        <thead><tr><th>{en ? "Date" : "日期"}</th>{series ? series.map(curve => <th key={curve.id}>{curve.label ?? curve.id}</th>) : <th>{en ? "Revenue" : "营业额"}</th>}</tr></thead>
        <tbody>{revenuePoint.dailyRevenueDetails?.map(day => <tr key={day.date}><td><time dateTime={day.date}>{day.date}</time></td>{(day.revenues ?? [day.revenue]).map((value, index) => <td key={index}>{value}</td>)}</tr>)}</tbody>
      </table></div>}
    </details> : <details><summary>{en ? "View data table" : "查看数据表"}</summary><div className="table-scroll"><table className="data-table"><thead><tr><th>{en ? "Period" : "时间"}</th><th>{en ? "Details" : "统计明细"}</th></tr></thead><tbody>{points.map(p => <tr key={p.label}><td>{p.label}</td><td>{p.detail}</td></tr>)}</tbody></table></div></details>}
  </section>;
}
