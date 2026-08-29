"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { apiRequest } from "../lib/api";

interface OpenWorkDatesResponse {
  dates: string[];
}

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

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-");
  return year + " 年 " + Number(monthNumber) + " 月";
}

function dateLabel(value: string): string {
  const [year, month, day] = value.split("-");
  return year + " 年 " + Number(month) + " 月 " + Number(day) + " 日";
}

export function BusinessDatePicker({
  storeId,
  value,
  max,
  onChange,
  ariaLabel,
}: {
  storeId: string;
  value: string;
  max: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(value.slice(0, 7));
  const [markedDates, setMarkedDates] = useState<Set<string>>(new Set());
  const [loadingMarks, setLoadingMarks] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const requestGeneration = useRef(0);
  const dialogId = useId();

  useEffect(() => {
    if (!open) setMonth(value.slice(0, 7));
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
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
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const generation = ++requestGeneration.current;
    const { first, last } = monthBounds(month);
    setLoadingMarks(true);
    apiRequest<OpenWorkDatesResponse>(
      "/stores/" + storeId + "/business-days/open-work-dates?dateFrom=" + first + "&dateTo=" + last,
    )
      .then((result) => {
        if (generation === requestGeneration.current) {
          setMarkedDates(new Set(result.dates));
        }
      })
      .catch(() => {
        if (generation === requestGeneration.current) setMarkedDates(new Set());
      })
      .finally(() => {
        if (generation === requestGeneration.current) setLoadingMarks(false);
      });
  }, [month, open, storeId]);

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
    <div className="business-date-picker" ref={rootRef}>
      <button
        className="business-date-picker__trigger"
        type="button"
        aria-label={ariaLabel + "：" + dateLabel(value)}
        aria-expanded={open}
        aria-controls={dialogId}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{value}</span><span aria-hidden="true">▾</span>
      </button>
      {open && (
        <section className="business-date-picker__popover" id={dialogId} role="dialog" aria-label={ariaLabel + "日历"}>
          <header>
            <button type="button" aria-label="上个月" onClick={() => setMonth((current) => shiftMonth(current, -1))}>‹</button>
            <strong>{monthLabel(month)}</strong>
            <button type="button" aria-label="下个月" disabled={shiftMonth(month, 1) > max.slice(0, 7)} onClick={() => setMonth((current) => shiftMonth(current, 1))}>›</button>
          </header>
          <div className="business-date-picker__weekdays" aria-hidden="true">
            {["日", "一", "二", "三", "四", "五", "六"].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="business-date-picker__days">
            {Array.from({ length: calendar.leading }, (_, index) => <span key={"blank-" + index} />)}
            {calendar.days.map(({ day, date }) => {
              const marked = markedDates.has(date);
              return (
                <button
                  key={date}
                  type="button"
                  disabled={date > max}
                  className={(date === value ? "selected" : "") + (marked ? " has-open-work" : "")}
                  aria-label={dateLabel(date) + (marked ? "，有记工但未日结" : "")}
                  onClick={() => { onChange(date); setOpen(false); }}
                >
                  <span>{day}</span>{marked && <i aria-hidden="true" />}
                </button>
              );
            })}
          </div>
          <footer><span className="business-date-picker__legend-dot" aria-hidden="true" />有记工但未日结{loadingMarks && <em>正在更新…</em>}</footer>
        </section>
      )}
    </div>
  );
}
