"use client";

import { useId, useState } from "react";
import { formatUsdPrecise } from "../../lib/money";
import type { FinanceSummaryResponse } from "../../lib/types";
import { useLanguage } from "../language-provider";
import { Chart } from "./analytics-chart";
import { groupIncomePeriods, type IncomePeriod } from "./analytics-income-periods";

export type AnalyticsIncomeData = {
  days: FinanceSummaryResponse["days"];
  loading: boolean; failed: boolean; error: string; retry: () => void;
};

export function AnalyticsIncomeBars({ days, dateFrom, dateTo, loading, failed, error, retry }: AnalyticsIncomeData & { dateFrom: string; dateTo: string }) {
  const { locale } = useLanguage();
  const en = locale === "en-US";
  const [period, setPeriod] = useState<IncomePeriod>("WEEK");
  const id = useId();
  const title = en ? "Turnover and income" : "流水与收入柱状图";
  const description = en ? "Totals follow the dates and highlight filter above. Weeks run Monday–Sunday; months are calendar months. Edge periods include selected dates only. Total income follows daily subtotals, before card fees." : "按上方日期及高光条件合计；每周按周一至周日，每月按自然月，首尾仅统计所选日期。总收入沿用每日小计口径（手续费前）。";
  const series = [
    { id: "turnover", key: "turnoverCents", label: en ? "Total turnover" : "总流水", color: "var(--brand)" },
    { id: "store", key: "storeIncomeCents", label: en ? "Store income" : "店铺收入", color: "var(--chart-secondary)" },
    { id: "total", key: "totalIncomeCents", label: en ? "Total income" : "总收入", color: "var(--ink)" },
  ] as const;
  const controls = <div className="analytics-income-controls">
    <label htmlFor={id}>{en ? "Group by" : "统计周期"}<select id={id} value={period} onChange={event => setPeriod(event.target.value as IncomePeriod)}>
      <option value="DAY">{en ? "Daily" : "每天"}</option><option value="WEEK">{en ? "Weekly" : "每周"}</option><option value="MONTH">{en ? "Monthly" : "每月"}</option>
    </select></label>
    <ul className="analytics-income-legend" aria-label={en ? "All three amounts are shown" : "三项金额全部显示"}>{series.map(item => <li key={item.id}><svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" fill={item.color} /></svg>{item.label}</li>)}</ul>
    {loading && days.length > 0 && !failed && <p role="status">{en ? "Updating turnover and income…" : "正在更新流水与收入…"}</p>}
  </div>;
  if (failed || days.length === 0) return <section className="analytics-card analytics-income-bars" aria-busy={loading}>
    <h2>{title}</h2><p className="analytics-description">{description}</p>{controls}
    {failed ? <p role={error ? "alert" : "status"} className={error ? "form-error" : undefined}>{error} <button type="button" onClick={retry}>{en ? "Retry" : "重试"}</button></p>
      : <p role={loading ? "status" : undefined} className={loading ? undefined : "empty-state"}>{loading ? (en ? "Loading turnover and income…" : "正在读取流水与收入…") : (en ? "No financial data in this range." : "当前范围没有财务数据。")}</p>}
  </section>;
  const groups = groupIncomePeriods(days, dateFrom, dateTo, period);
  return <Chart key={period} className="analytics-income-bars" title={title} description={description} bars compactBars currency controls={controls}
    series={series.map(item => ({ id: item.id, color: item.color, values: groups.map(group => group[item.key] / 100) }))}
    points={groups.map(group => ({ label: group.label, value: null, detail: [group.from === group.to ? group.from : `${group.from} — ${group.to}`, ...series.map(item => `${item.label} ${formatUsdPrecise(group[item.key], locale)}`)].join(" · ") }))} />;
}
