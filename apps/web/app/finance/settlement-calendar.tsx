"use client";

import { useLanguage } from "../language-provider";
import { formatUsdPrecise } from "../../lib/money";
import { settlementMonthDays, shiftSettlementMonth, type SettlementDateRange } from "../../lib/settlement-calendar";
import type { EmployeeSettlementCalendar } from "../../lib/types";

export function SettlementCalendar({ month, range, data, loading, error, failed, disabled, onMonth, onDate, retry }: {
  month: string; range: SettlementDateRange; data: EmployeeSettlementCalendar | null;
  loading: boolean; error: string; failed: boolean; disabled: boolean;
  onMonth: (month: string) => void; onDate: (date: string) => void; retry: () => void;
}) {
  const { locale } = useLanguage();
  const en = locale === "en-US";
  const title = new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${month}-01T12:00:00.000Z`));
  const byDate = new Map(data?.days.map((day) => [day.businessDate, day]) ?? []);
  const weekdays = en ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] : ["一", "二", "三", "四", "五", "六", "日"];
  return <section className="settlement-calendar" aria-label={en ? "Select settlement dates" : "选择结算日期"} aria-busy={loading}>
    <header className="settlement-calendar-heading">
      <button type="button" className="secondary-action" disabled={disabled || month === "0001-01"} onClick={() => onMonth(shiftSettlementMonth(month, -1))} aria-label={en ? "Previous month" : "上个月"}>‹</button>
      <h3>{title}</h3>
      <button type="button" className="secondary-action" disabled={disabled || month === "9999-12"} onClick={() => onMonth(shiftSettlementMonth(month, 1))} aria-label={en ? "Next month" : "下个月"}>›</button>
    </header>
    <div className="settlement-calendar-legend"><span><b className="settlement-check-cash">✓</b> {en ? "Cash settled" : "现金已结"}</span><span><b className="settlement-check-noncash">✓</b> {en ? "Card + gift card settled" : "刷卡＋礼物卡已结"}</span></div>
    {loading && <p role="status" className="settlement-calendar-status">{en ? "Loading settlement status…" : "正在读取结算状态…"}</p>}
    {failed && <p role={error ? "alert" : "status"} className="settlement-calendar-status">{error} <button type="button" className="table-action" disabled={disabled} onClick={retry}>{en ? "Retry" : "重试"}</button></p>}
    <div className="settlement-calendar-weekdays" aria-hidden="true">{weekdays.map((day) => <span key={day}>{day}</span>)}</div>
    <div className="settlement-calendar-days">
      {settlementMonthDays(month).map((date, index) => {
        if (!date) return <span key={`blank-${index}`} aria-hidden="true" />;
        const day = byDate.get(date);
        const selected = date === range.dateFrom || date === range.dateTo;
        const inRange = Boolean(range.dateTo && date >= range.dateFrom && date <= range.dateTo);
        const statuses = [day?.cashSettled ? (en ? "Cash settled" : "现金已结") : "", day?.nonCashSettled ? (en ? "Card + gift card settled" : "刷卡＋礼物卡已结") : ""];
        if (day?.cashSettled && day.cashUnsettledCents > 0) statuses.push(`${en ? "Cash wage shortfall" : "现金工资缺口"} ${formatUsdPrecise(day.cashUnsettledCents)}`);
        if (day?.dailySettlementEnabled) statuses.push(en ? "Daily wages fully settled" : "当天工资已全部结清");
        const label = [date, ...statuses].filter(Boolean).join(" · ");
        return <button key={date} type="button" disabled={disabled} className={`settlement-calendar-day${inRange ? " is-in-range" : ""}${selected ? " is-endpoint" : ""}`} aria-pressed={selected || inRange} aria-label={label} title={label} onClick={() => onDate(date)}>
          <time dateTime={date}>{Number(date.slice(8))}</time>
          <span className="settlement-calendar-marks" aria-hidden="true">{day?.cashSettled && <b className="settlement-check-cash">✓</b>}{day?.nonCashSettled && <b className="settlement-check-noncash">✓</b>}</span>
        </button>;
      })}
    </div>
    <p className="settlement-calendar-selection" role="status">{range.selectingEnd
      ? (en ? `Start: ${range.dateFrom}. Select the end date.` : `开始：${range.dateFrom}，请选择结束日期`)
      : (en ? `${range.dateFrom} – ${range.dateTo} (both dates included)` : `${range.dateFrom} 至 ${range.dateTo}（含首尾两天）`)}</p>
  </section>;
}
