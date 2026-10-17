"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLanguage } from "../language-provider";
import { smoothChartPath } from "./analytics-curve";

export type ChartPoint = { label: string; value: number | null; secondary?: number | null; lostCount?: number; detail: string; dailyDetails?: { date: string; count: number }[]; dailyRevenueDetails?: { date: string; revenue: string }[] };

export type ChartSeries = { id: string; color: string; dash?: string; values: (number | null)[] };

export function Chart({ title, description, points, bars = false, currency = false, legend, series, controls, className = "" }: {
  title: string; description: string; points: ChartPoint[]; bars?: boolean; currency?: boolean; legend?: string | undefined;
  series?: ChartSeries[]; controls?: ReactNode; className?: string;
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
  const fixedWidth = !bars || groupedBars;
  useEffect(() => {
    if (!fixedWidth || !plot.current || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setPlotWidth(Math.max(240, entry.contentRect.width));
    });
    observer.observe(plot.current);
    return () => observer.disconnect();
  }, [fixedWidth]);
  const curves: ChartSeries[] = series ?? [
    { id: "primary", color: "var(--brand)", values: points.map(point => point.value) },
    { id: "secondary", color: "var(--chart-secondary)", dash: "6 4", values: points.map(point => point.secondary ?? null) },
  ];
  const width = fixedWidth ? plotWidth : Math.max(600, points.length * 26 + 80);
  const height = 270, left = 65, right = width - 20, bottom = 225, top = 20;
  const max = bars && !groupedBars ? points.reduce((max, point) => Math.max(max, (point.value ?? 0) + (point.lostCount ?? 0)), 1)
    : curves.reduce((max, curve) => curve.values.reduce<number>((max, value) => Math.max(max, value ?? 0), max), 1);
  const min = groupedBars ? curves.reduce((min, curve) => curve.values.reduce<number>((min, value) => Math.min(min, value ?? 0), min), 0) : 0;
  const floor = currency ? Math.floor(min / 5) * 5 : Math.floor(min);
  const ceiling = currency ? Math.ceil(max / 5) * 5 : Math.max(4, Math.ceil(max / 4) * 4);
  const x = (i: number) => left + (i + .5) * (right - left) / Math.max(1, points.length);
  const y = (value: number) => bottom - (value - floor) / (ceiling - floor) * (bottom - top);
  const labelCount = Math.min(points.length, Math.max(2, Math.floor((right - left) / 75)));
  const labelIndices = new Set(Array.from({ length: labelCount }, (_, index) => Math.round(index * (points.length - 1) / Math.max(1, labelCount - 1))));
  return <section className={`analytics-card ${className}`.trim()}>
    <h2>{title}</h2><p className="analytics-description">{description}</p>
    {legend && <p className="analytics-legend">{legend}</p>}
    {controls}
    {points.length === 0 && <p className="empty-state">{en ? "No service records in this range." : "当前范围没有记工。"}</p>}
    <div className={fixedWidth ? "analytics-plot" : "analytics-scroll"} ref={plot} tabIndex={0} aria-label={title}>
      <svg width={fixedWidth ? "100%" : width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label={title}>
        {Array.from({ length: 5 }, (_, i) => { const value = floor + (ceiling - floor) * i / 4; return <g key={i}>
          <line x1={left} x2={right} y1={y(value)} y2={y(value)} stroke="var(--line)" />
          <text x={left - 8} y={y(value) + 4} textAnchor="end">{currency ? `$${Math.round(value)}` : value}</text>
        </g>; })}
        {!bars && curves.map(curve => <path key={curve.id} data-series={curve.id} d={smoothChartPath(curve.values, x, y)} fill="none" stroke={curve.color} strokeWidth="2.5" strokeDasharray={curve.dash} />)}
        {groupedBars && <line className="analytics-zero-line" x1={left} x2={right} y1={y(0)} y2={y(0)} stroke="var(--muted)" />}
        {points.map((point, i) => <g key={point.label}>
          {groupedBars && curves.map((curve, seriesIndex) => {
            const value = curve.values[i];
            if (value == null) return null;
            const barWidth = Math.min(22, (right - left) / points.length * .72 / curves.length);
            return <rect key={curve.id} data-series={curve.id} x={x(i) + (seriesIndex - curves.length / 2) * barWidth} y={Math.min(y(value), y(0))} width={barWidth * .88} height={Math.abs(y(value) - y(0))} fill={curve.color} rx="1" />;
          })}
          {bars && !groupedBars && point.value !== null && <rect x={x(i) - Math.min(22, (right - left) / points.length * .32)} y={y(point.value)} width={Math.min(44, (right - left) / points.length * .64)} height={bottom - y(point.value)} fill="var(--brand)" rx="3" />}
          {bars && (point.lostCount ?? 0) > 0 && <g data-lost-count={point.lostCount}>
            <rect x={x(i) - Math.min(22, (right - left) / points.length * .32)} y={y((point.value ?? 0) + point.lostCount!)} width={Math.min(44, (right - left) / points.length * .64)} height={y(point.value ?? 0) - y((point.value ?? 0) + point.lostCount!)} fill="var(--chart-loss)" rx="2" />
            <text className="analytics-lost-count" x={x(i)} y={y((point.value ?? 0) + point.lostCount!) - 5} textAnchor="middle">+{point.lostCount}</text>
          </g>}
          {bars && !groupedBars && point.value === null && <text x={x(i)} y={bottom - 8} textAnchor="middle">—</text>}
          {!bars && curves.map(curve => curve.values[i] != null && <circle key={curve.id} cx={x(i)} cy={y(curve.values[i]!)} r={points.length > 90 ? 1.5 : 2.5} fill={curve.color} />)}
          {labelIndices.has(i) && <text x={x(i)} y={bottom + 23} textAnchor="middle">{point.label.length === 10 ? point.label.slice(5) : point.label}</text>}
          <rect className="analytics-hit" x={x(i) - (right - left) / points.length / 2} y={top} width={(right - left) / points.length} height={bottom - top + (point.dailyRevenueDetails !== undefined ? 35 : 0)} fill="transparent" tabIndex={0} role="button" aria-label={point.detail} aria-pressed={point.dailyRevenueDetails !== undefined ? revenueSelection === point.label : undefined}
            onMouseEnter={() => setSelected(point.label)} onFocus={() => setSelected(point.label)} onClick={() => activate(point)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(point); } }}><title>{point.detail}</title></rect>
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
    </details> : points.some(point => point.dailyRevenueDetails !== undefined) ? <details className="weekday-revenue-details" ref={revenueTable}>
      <summary>{en ? "View data table" : "查看数据表"}{revenuePoint && ` · ${revenuePoint.label}`}</summary>
      {!revenuePoint ? <p className="empty-state">{en ? "Select a weekday in the chart to see its daily revenue." : "点击图中的星期，查看该星期各日期的营业额。"}</p> : revenuePoint.dailyRevenueDetails?.length === 0 ? <p className="empty-state">{en ? "No dates for this weekday in the selected range." : "当前范围没有该星期的日期。"}</p> : <div className="table-scroll" aria-live="polite"><table className="data-table">
        <thead><tr><th>{en ? "Date" : "日期"}</th><th>{en ? "Revenue" : "营业额"}</th></tr></thead>
        <tbody>{revenuePoint.dailyRevenueDetails?.map(day => <tr key={day.date}><td><time dateTime={day.date}>{day.date}</time></td><td>{day.revenue}</td></tr>)}</tbody>
      </table></div>}
    </details> : <details><summary>{en ? "View data table" : "查看数据表"}</summary><div className="table-scroll"><table className="data-table"><thead><tr><th>{en ? "Period" : "时间"}</th><th>{en ? "Details" : "统计明细"}</th></tr></thead><tbody>{points.map(p => <tr key={p.label}><td>{p.label}</td><td>{p.detail}</td></tr>)}</tbody></table></div></details>}
  </section>;
}
