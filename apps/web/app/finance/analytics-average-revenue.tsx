"use client";

import { useState } from "react";
import type { FinanceAnalyticsResponse } from "@massage-note/contracts";
import { useLanguage } from "../language-provider";
import { formatUsdPrecise } from "../../lib/money";
import { Chart } from "./analytics-chart";

export function AnalyticsAverageRevenue({ data }: { data: FinanceAnalyticsResponse }) {
  const { locale } = useLanguage();
  const en = locale === "en-US";
  const [visible, setVisible] = useState(["30"]);
  const options = [
    { id: "30", label: en ? "Trailing 30-day average" : "最近30天平均", color: "var(--brand)", amount: "average30Cents", count: "average30DayCount" },
    { id: "all", label: en ? "Cumulative average" : "全日期累计平均", color: "var(--ink)", dash: "2 4", amount: "cumulativeAverageCents", count: "cumulativeAverageDayCount" },
    { id: "7", label: en ? "Trailing 7-day average" : "最近7天平均", color: "var(--chart-secondary)", dash: "6 4", amount: "averageCents", count: "averageDayCount" },
  ] as const;
  const selected = options.filter(option => visible.includes(option.id));
  const money = (cents: string | null) => cents === null ? "—" : formatUsdPrecise(Number(cents), locale);
  return <Chart className="analytics-average-revenue" title={en ? "Average revenue curves" : "平均营业额曲线"}
    description={en ? "30/7-day averages use closed days in the trailing calendar window, including dates before the selected start. Cumulative average runs from the selected start through each date. Open days are gaps; empty closed days count as zero. Dates follow the selected range. The vertical axis follows the lowest and highest visible values; the maximum is marked with its amount and date." : "近30天／7天按当日及此前窗口内的已日结日期取平均，包含所选起日前的样本；全日期平均从所选起日累计到当天。未日结留空，空日结计零；横轴为所选日期，纵轴按已勾选曲线的最低／最高值缩放，并标注最高值金额与日期。"}
    currency fitToData controls={<fieldset className="analytics-curve-options">
      <legend>{en ? "Select curves · multiple allowed" : "选择曲线 · 可同时显示"}</legend>
      {options.map(option => <label key={option.id}>
        <input type="checkbox" checked={visible.includes(option.id)} onChange={event => setVisible(current => event.target.checked ? [...current, option.id] : current.filter(id => id !== option.id))} />
        <svg width="24" height="12" viewBox="0 0 24 12" aria-hidden="true"><line x1="0" y1="6" x2="24" y2="6" stroke={option.color} strokeWidth="2.5" strokeDasharray={"dash" in option ? option.dash : undefined} /></svg>
        {option.label}
      </label>)}
      {selected.length === 0 && <p role="status">{en ? "Select at least one curve." : "请至少选择一条曲线。"}</p>}
    </fieldset>}
    series={selected.map(option => ({ id: option.id, label: option.label, color: option.color, ...("dash" in option ? { dash: option.dash } : {}), values: data.days.map(day => day[option.amount] === null ? null : Number(day[option.amount]) / 100) }))}
    points={data.days.map(day => ({ label: day.businessDate, value: null, detail: [day.businessDate,
      `${en ? "Daily revenue" : "当天营业额"} ${money(day.revenueCents)}${day.revenueCents === null ? (en ? " (not closed)" : "（未日结）") : ""}`,
      ...selected.map(option => `${option.label} ${money(day[option.amount])} · ${day[option.count]} ${en ? "closed days" : "个已日结日"}`),
    ].join(" · ") }))}
  />;
}
