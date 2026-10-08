"use client";

import { useMemo, useState } from "react";
import type { FinanceAnalyticsResponse } from "@massage-note/contracts";
import { shiftSettlementMonth } from "../../lib/settlement-calendar";
import { formatUsdPrecise } from "../../lib/money";
import { useLanguage } from "../language-provider";

export function AnalyticsRevenueCalendar({ data, disabled, onDate }: {
  data: FinanceAnalyticsResponse;
  disabled: boolean;
  onDate: (date: string) => void;
}) {
  const { locale } = useLanguage();
  const en = locale === "en-US";
  const [month, setMonth] = useState(data.dateTo.slice(0, 7));
  const [selected, setSelected] = useState<string | null>(null);
  const days = useMemo(() => new Map(data.days.map(day => [day.businessDate, day])), [data.days]);
  const first = new Date(`${month}-01T00:00:00.000Z`);
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1);
  last.setUTCDate(0);
  const title = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", timeZone: "UTC" }).format(first);
  return <section className="analytics-card analytics-revenue-calendar">
    <h2>{en ? "Daily revenue calendar" : "每日营业额日历"}</h2>
    <p className="analytics-description">{en ? "Revenue follows the selected dates and highlight filter. Open days show a dash; empty closed days show zero. Select a date to view its details." : "营业额按所选日期和高光条件显示；未日结显示 —，空日结显示 0。点击日期查看当天明细。"}</p>
    <div className="business-date-picker business-date-picker--inline">
      <section className="business-date-picker__popover" role="group" aria-label={en ? "Daily revenue calendar" : "每日营业额日历"}>
        <header>
          <button type="button" aria-label={en ? "Previous month" : "上个月"} disabled={month <= data.dateFrom.slice(0, 7)} onClick={() => setMonth(shiftSettlementMonth(month, -1))}>‹</button>
          <strong>{title}</strong>
          <button type="button" aria-label={en ? "Next month" : "下个月"} disabled={month >= data.dateTo.slice(0, 7)} onClick={() => setMonth(shiftSettlementMonth(month, 1))}>›</button>
        </header>
        <div className="business-date-picker__weekdays" aria-hidden="true">{(en ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["日", "一", "二", "三", "四", "五", "六"]).map(day => <span key={day}>{day}</span>)}</div>
        <div className="business-date-picker__days">
          {Array.from({ length: first.getUTCDay() }, (_, index) => <span key={`blank-${index}`} aria-hidden="true" />)}
          {Array.from({ length: last.getUTCDate() }, (_, index) => {
            const date = `${month}-${String(index + 1).padStart(2, "0")}`;
            const day = days.get(date);
            const inRange = date >= data.dateFrom && date <= data.dateTo;
            const revenue = day?.revenueCents;
            const amount = revenue == null ? "—" : (Number(revenue) / 100).toFixed(2).replace(/\.00$/, "");
            const label = `${date} · ${!inRange ? (en ? "Outside selected dates" : "不在所选日期内") : revenue == null ? (en ? "Not closed" : "未日结") : `${en ? "Revenue" : "营业额"} ${formatUsdPrecise(Number(revenue), locale)}`}`;
            return <button key={date} type="button" disabled={!inRange || disabled} className={`${selected === date ? "selected " : ""}${inRange ? "has-closed-revenue" : ""}`} aria-label={label} title={label} aria-pressed={selected === date} onClick={() => { setSelected(date); onDate(date); }}>
              <time dateTime={date}>{index + 1}</time>
              {inRange && <small className="business-date-picker__revenue">{amount}</small>}
            </button>;
          })}
        </div>
      </section>
    </div>
  </section>;
}
