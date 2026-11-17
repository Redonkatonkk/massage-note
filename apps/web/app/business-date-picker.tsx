"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { apiRequest } from "../lib/api";
import type { BusinessDateCalendarCache, OpenWorkDatesResponse } from "../lib/business-date-calendar-cache";
import type { AppLocale } from "../lib/i18n";

const emptyMarks: OpenWorkDatesResponse = { dates: [], closedDates: [] };
export type BusinessDateCalendarData = Pick<OpenWorkDatesResponse, "dates"> & {
  closedDates?: Array<Pick<NonNullable<OpenWorkDatesResponse["closedDates"]>[number], "date" | "revenueCents">>;
};

function monthBounds(month: string): { first: string; last: string } {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
  return { first: month + "-01", last: month + "-" + String(lastDay).padStart(2, "0") };
}

function shiftMonth(month: string, amount: number): string {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year!, monthNumber! - 1 + amount, 1));
  return date.toISOString().slice(0, 7);
}

function monthLabel(month: string, locale: AppLocale): string {
  if (locale === "en-US") return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(month + "-01T12:00:00Z"));
  const [year, monthNumber] = month.split("-");
  return year + " 年 " + Number(monthNumber) + " 月";
}

function dateLabel(value: string, locale: AppLocale): string {
  if (locale === "en-US") return new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: "UTC" }).format(new Date(value + "T12:00:00Z"));
  const [year, month, day] = value.split("-");
  return year + " 年 " + Number(month) + " 月 " + Number(day) + " 日";
}

export function BusinessDatePicker({
  storeId,
  value,
  min,
  max,
  onChange,
  ariaLabel,
  inline = false,
  refreshKey,
  cache,
  calendarData,
  calendarLoading = false,
  locale = "zh-CN",
  onMonthChange,
}: {
  storeId: string;
  value: string;
  min?: string | undefined;
  max?: string | undefined;
  onChange: (value: string) => void;
  ariaLabel: string;
  inline?: boolean;
  refreshKey?: string | undefined;
  cache?: BusinessDateCalendarCache;
  calendarData?: BusinessDateCalendarData;
  calendarLoading?: boolean;
  locale?: AppLocale;
  onMonthChange?: (month: string) => void;
}) {
  const en = locale === "en-US";
  const [open, setOpen] = useState(false);
  const expanded = inline || open;
  const [month, setMonth] = useState(value.slice(0, 7));
  const [marks, setMarks] = useState(() => ({
    storeId, month: value.slice(0, 7), data: calendarData === undefined ? cache?.peek(storeId, value.slice(0, 7)) ?? emptyMarks : emptyMarks,
  }));
  const data = calendarData ?? (marks.storeId === storeId && marks.month === month ? marks.data : emptyMarks);
  const markedDates = useMemo(() => new Set(data.dates), [data]);
  const closedRevenue = useMemo(() => new Map((data.closedDates ?? []).map(item => [item.date, item.revenueCents])), [data]);
  const [loadingMarks, setLoadingMarks] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const requestGeneration = useRef(0);
  const dialogId = useId();

  useEffect(() => {
    if (inline || !open) setMonth(value.slice(0, 7));
  }, [inline, open, value]);

  useEffect(() => {
    if (expanded) onMonthChange?.(month);
  }, [expanded, month, onMonthChange]);

  useEffect(() => {
    if (inline || !open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [inline, open]);

  useEffect(() => {
    if (!expanded || calendarData !== undefined) return;
    const generation = ++requestGeneration.current;
    const { first, last } = monthBounds(month);
    const cached = cache?.peek(storeId, month);
    if (cached) setMarks({ storeId, month, data: cached });
    setLoadingMarks(!cached);
    const fetchDates = () => apiRequest<OpenWorkDatesResponse>(
      "/stores/" + storeId + "/business-days/open-work-dates?dateFrom=" + first + "&dateTo=" + last,
    );
    (cache ? cache.load(storeId, month, fetchDates) : fetchDates())
      .then((result) => {
        if (generation === requestGeneration.current) {
          setMarks({ storeId, month, data: { ...result, closedDates: result.closedDates ?? [] } });
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (generation === requestGeneration.current) setLoadingMarks(false);
      });
    return () => { requestGeneration.current += 1; };
  }, [month, expanded, storeId, refreshKey, cache, calendarData]);

  const calendar = useMemo(() => {
    const { first, last } = monthBounds(month);
    const leading = new Date(first + "T00:00:00.000Z").getUTCDay();
    const dayCount = Number(last.slice(-2));
    return {
      leading,
      days: Array.from({ length: dayCount }, (_, index) => {
        const day = String(index + 1).padStart(2, "0");
        return { day: index + 1, date: month + "-" + day };
      }),
    };
  }, [month]);

  return (
    <div className={`business-date-picker${inline ? " business-date-picker--inline" : ""}`} ref={rootRef}>
      {!inline && <button
        className="business-date-picker__trigger"
        type="button"
        aria-label={ariaLabel + (en ? ": " : "：") + dateLabel(value, locale)}
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{value}</span><span aria-hidden="true">▾</span>
      </button>}
      {expanded && (
        <section className="business-date-picker__popover" id={dialogId} role={inline ? "group" : "dialog"} aria-label={ariaLabel + (en ? " calendar" : "日历")} aria-busy={calendarData !== undefined ? calendarLoading : loadingMarks}>
          <header>
            <button type="button" aria-label={en ? "Previous month" : "上个月"} disabled={min !== undefined && shiftMonth(month, -1) < min.slice(0, 7)} onClick={() => setMonth((current) => shiftMonth(current, -1))}>‹</button>
            <strong>{monthLabel(month, locale)}</strong>
            <button type="button" aria-label={en ? "Next month" : "下个月"} disabled={max !== undefined && shiftMonth(month, 1) > max.slice(0, 7)} onClick={() => setMonth((current) => shiftMonth(current, 1))}>›</button>
          </header>
          <div className="business-date-picker__weekdays" aria-hidden="true">
            {(en ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["日", "一", "二", "三", "四", "五", "六"]).map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="business-date-picker__days">
            {Array.from({ length: calendar.leading }, (_, index) => <span key={"blank-" + index} />)}
            {calendar.days.map(({ day, date }) => {
              const marked = markedDates.has(date);
              const revenue = closedRevenue.get(date);
              const amount = revenue === undefined ? undefined : (revenue / 100).toFixed(2).replace(/\.00$/, "");
              return (
                <button
                  key={date}
                  type="button"
                  disabled={(min !== undefined && date < min) || (max !== undefined && date > max)}
                  className={(date === value ? "selected" : "") + (marked ? " has-open-work" : "") + (amount !== undefined ? " has-closed-revenue" : "")}
                  aria-pressed={date === value}
                  aria-label={dateLabel(date, locale) + (marked ? (en ? ", work recorded, not closed" : "，有记工但未日结") : "")}
                  onClick={() => { onChange(date); setOpen(false); }}
                >
                  <span>{day}</span>
                  {amount !== undefined && <small className="business-date-picker__revenue">{amount}</small>}
                  {marked && <i aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          {!inline && <footer><span className="business-date-picker__legend-dot" aria-hidden="true" />{en ? "Work recorded, not closed" : "有记工但未日结"}{calendarData === undefined && loadingMarks && <em>{en ? "Updating…" : "正在更新…"}</em>}</footer>}
        </section>
      )}
    </div>
  );
}
