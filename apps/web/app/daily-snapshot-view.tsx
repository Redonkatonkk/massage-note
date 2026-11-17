import type { DailySnapshotResponse } from "@massage-note/contracts";
import type { AppLocale } from "../lib/i18n";
import { BusinessDatePicker, type BusinessDateCalendarData } from "./business-date-picker";
import { DailySnapshotCard, DailySnapshotSources } from "./daily-snapshot-card";

type SnapshotData = Pick<DailySnapshotResponse, "snapshot" | "monthToDate">;

export function DailySnapshotView({
  storeName, employeeName, date, minDate, maxDate, locale, data, calendarData, calendarLoading,
  calendarRetry, dayRetry, onSelectDate, onMonthChange,
}: {
  storeName: string;
  employeeName: string;
  date: string;
  minDate: string;
  maxDate: string;
  locale: AppLocale;
  data: SnapshotData | null;
  calendarData: BusinessDateCalendarData;
  calendarLoading?: boolean;
  calendarRetry?: () => void;
  dayRetry?: () => void;
  onSelectDate: (date: string) => void;
  onMonthChange?: (month: string) => void;
}) {
  const en = locale === "en-US";
  const calendarLabel = en ? "Work date" : "记工日期";
  return <>
    <header className="daily-snapshot-page-heading">
      <div><p>{storeName}</p><h1>{employeeName} <span>· {en ? "Daily work card" : "每日记工"}</span></h1></div>
      <div className="daily-snapshot-date-controls" role="group" aria-label={en ? "Choose a work date" : "选择记工日期"}>
        <button type="button" aria-label={en ? "Previous day" : "前一天"} disabled={date <= minDate} onClick={() => onSelectDate(shiftDay(date, -1))}><Chevron /></button>
        <time className="daily-snapshot-selected-date" dateTime={date}>{date}</time>
        <button type="button" aria-label={en ? "Next day" : "后一天"} disabled={date >= maxDate} onClick={() => onSelectDate(shiftDay(date, 1))}><Chevron next /></button>
      </div>
    </header>
    <p className="daily-snapshot-sr-only" role="status">{en ? "Showing" : "正在查看"} {date}</p>
    {data ? <DailySnapshotCard key={date} snapshot={data.snapshot} locale={locale} /> : <section className="daily-snapshot-state" aria-live="polite">
      {dayRetry ? <><p>{en ? "Unable to load this date." : "暂时无法读取这一天的记工。"}</p><button className="secondary-action" type="button" onClick={dayRetry}>{en ? "Retry date" : "重试读取日期"}</button></> : <p>{en ? "Loading this date…" : "正在读取这一天的记工…"}</p>}
    </section>}
    <div className="daily-snapshot-overview">
      <section className="daily-snapshot-calendar" aria-labelledby="daily-snapshot-calendar-title">
        <h2 id="daily-snapshot-calendar-title">{en ? "Choose a date" : "选择日期"}</h2>
        <BusinessDatePicker
          inline storeId="daily-snapshot" value={date} min={minDate} max={maxDate} locale={locale}
          calendarData={calendarData} calendarLoading={calendarLoading ?? false} ariaLabel={calendarLabel}
          onChange={onSelectDate} {...(onMonthChange && { onMonthChange })}
        />
        <p>{en ? "Amounts below dates are daily earnings in USD." : "日期下方为当日收入，单位为美元。"}</p>
        {calendarRetry && <p role="status"><button className="secondary-action" type="button" onClick={calendarRetry}>{en ? "Reload earnings calendar" : "重新读取日历收入"}</button></p>}
      </section>
      {data ? <DailySnapshotSources snapshot={data.snapshot} monthToDate={data.monthToDate} locale={locale} /> : <section className="daily-snapshot-sources" aria-busy={!dayRetry}>
        <h2>{en ? "Earnings by payment source" : "按收款来源核对收入"}</h2>
        <p>{dayRetry ? (en ? "Earnings unavailable for this date." : "这一天的收入暂不可用。") : (en ? "Loading earnings…" : "正在读取收入…")}</p>
      </section>}
    </div>
  </>;
}

function shiftDay(date: string, amount: number): string {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + amount);
  return day.toISOString().slice(0, 10);
}

function Chevron({ next = false }: { next?: boolean }) {
  return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d={next ? "m6 3 5 5-5 5" : "m10 3-5 5 5 5"} /></svg>;
}
