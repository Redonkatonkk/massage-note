"use client";

import type { WeekdayRevenueComparison } from "@massage-note/contracts";
import { useLanguage } from "../language-provider";
import { Chart } from "./analytics-chart";

export function AnalyticsWeekdayRevenue({ data }: { data: WeekdayRevenueComparison }) {
  const { locale } = useLanguage();
  const en = locale === "en-US";
  const names = en ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"];
  const money = (cents: string | null) => cents === null ? "—" : new Intl.NumberFormat(locale, { style: "currency", currency: "USD" }).format(Number(cents) / 100);
  const series = [
    { id: "highlighted", label: en ? "Highlighted" : "高光", color: "var(--brand)", average: "highlightedAverageCents", daily: "highlightedRevenueCents" },
    { id: "non-highlighted", label: en ? "Non-highlighted" : "非高光", color: "var(--chart-secondary)", average: "nonHighlightedAverageCents", daily: "nonHighlightedRevenueCents" },
    { id: "all", label: en ? "All" : "全部", color: "var(--ink)", average: "averageCents", daily: "revenueCents" },
  ] as const;
  return <Chart className="analytics-weekday-revenue" title={en ? "Average revenue by weekday" : "星期平均营业额"} bars currency
    description={en ? "All three scopes follow the selected dates and remain visible regardless of the highlight filter. They use the same closed-day samples; empty closed days count as zero and no samples show a dash. Card sales are included in non-highlighted and all revenue; each scope deducts its gift-card service payments. Select a weekday to compare its daily amounts below." : "随所选日期同时对比高光、非高光、全部，不随顶部高光筛选隐藏。三组使用相同已日结日期，空日结计零，无样本显示破折号；卖卡实收计入非高光和全部，各组均扣除对应礼卡大费。点击星期，下方列出三组逐日金额。"}
    controls={<ul className="analytics-income-legend" aria-label={en ? "Revenue comparison" : "营业额对比"}>{series.map(item => <li key={item.id}><svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" fill={item.color} /></svg>{item.label}</li>)}</ul>}
    series={series.map(item => ({ id: item.id, label: item.label, color: item.color, values: data.weekdays.map(day => day[item.average] === null ? null : Number(day[item.average]) / 100) }))}
    points={data.weekdays.map(day => ({ label: names[day.weekday]!, value: null,
      detail: [names[day.weekday], ...series.map(item => `${item.label} ${money(day[item.average])}`), `${day.closedDayCount} ${en ? "closed days" : "个已日结日"}`].join(" · "),
      dailyRevenueDetails: data.days.filter(row => (new Date(`${row.businessDate}T00:00:00Z`).getUTCDay() + 6) % 7 === day.weekday).map(row => ({ date: row.businessDate, revenue: money(row.revenueCents), revenues: series.map(item => money(row[item.daily])) })),
    }))} />;
}
