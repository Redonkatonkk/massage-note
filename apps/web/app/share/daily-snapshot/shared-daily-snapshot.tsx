"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { dailySnapshotTokenSchema, type DailySnapshotCalendar, type DailySnapshotResponse } from "@massage-note/contracts";
import { apiBase } from "../../../lib/api";
import { isPortfolioDemo } from "../../../lib/demo-mode";
import type { AppLocale } from "../../../lib/i18n";
import { DailySnapshotView } from "../../daily-snapshot-view";
import { useLanguage } from "../../language-provider";

const endpoint = "/public/daily-snapshots";
const emptyCalendar: DailySnapshotCalendar = { dates: [], closedDates: [] };
const maxTimeout = 2_147_483_647;

type DayRequest = { date?: string };
type MonthRequest = { month: string };
type Failure = "unavailable" | "error";

async function requestSnapshot<T>(path: string, token: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "omit",
    cache: "no-store",
    redirect: "error",
    referrerPolicy: "no-referrer",
    signal,
  });
  if (!response.ok) {
    const failure: Failure = [401, 403, 404, 410].includes(response.status) ? "unavailable" : "error";
    throw failure;
  }
  return await response.json() as T;
}

export function SharedDailySnapshot() {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const { locale } = useLanguage();

  useEffect(() => {
    const readToken = () => {
      const fragment = window.location.hash.slice(1);
      setToken(!isPortfolioDemo && dailySnapshotTokenSchema.safeParse(fragment).success ? fragment : null);
    };
    readToken();
    window.addEventListener("hashchange", readToken);
    return () => window.removeEventListener("hashchange", readToken);
  }, []);

  if (token) return <SnapshotSession key={token} token={token} initialLocale={locale} />;
  return <SnapshotPage locale={locale}><SnapshotStatus locale={locale} status={token === null ? "unavailable" : "loading"} /></SnapshotPage>;
}

function SnapshotSession({ token, initialLocale }: { token: string; initialLocale: AppLocale }) {
  const [linkLocale, setLinkLocale] = useState(initialLocale);
  const [chosenLocale, setChosenLocale] = useState<AppLocale | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [dayRequest, setDayRequest] = useState<DayRequest>({});
  const [loadedDay, setLoadedDay] = useState<{ request: DayRequest; value: DailySnapshotResponse } | null>(null);
  const [failedDay, setFailedDay] = useState<DayRequest | null>(null);
  const [monthRequest, setMonthRequest] = useState<MonthRequest | null>(null);
  const [loadedMonth, setLoadedMonth] = useState<{ request: MonthRequest; value: DailySnapshotCalendar } | null>(null);
  const [failedMonth, setFailedMonth] = useState<MonthRequest | null>(null);

  const invalidate = useCallback(() => {
    setUnavailable(true);
    setLoadedDay(null);
    setLoadedMonth(null);
  }, []);

  const viewLocale = chosenLocale ?? linkLocale;
  const expiresAt = loadedDay ? Date.parse(loadedDay.value.expiresAt) : null;

  useEffect(() => {
    if (unavailable) return;
    const controller = new AbortController();
    const query = dayRequest.date ? `?${new URLSearchParams({ date: dayRequest.date })}` : "";
    void requestSnapshot<DailySnapshotResponse>(endpoint + query, token, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      if (!(Date.parse(value.expiresAt) > Date.now())) { invalidate(); return; }
      if (dayRequest.date && value.snapshot.businessDate !== dayRequest.date) { setFailedDay(dayRequest); return; }
      setLinkLocale(value.locale === "en_US" ? "en-US" : "zh-CN");
      setLoadedDay({ request: dayRequest, value });
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      if (failure === "unavailable") invalidate();
      else setFailedDay(dayRequest);
    });
    return () => controller.abort();
  }, [token, unavailable, dayRequest, invalidate]);

  useEffect(() => {
    if (unavailable || !monthRequest) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ month: monthRequest.month });
    void requestSnapshot<DailySnapshotCalendar>(`${endpoint}/calendar?${query}`, token, controller.signal).then(value => {
      if (!controller.signal.aborted) setLoadedMonth({ request: monthRequest, value });
    }).catch((failure: unknown) => {
      if (controller.signal.aborted) return;
      if (failure === "unavailable") invalidate();
      else setFailedMonth(monthRequest);
    });
    return () => controller.abort();
  }, [token, unavailable, monthRequest, invalidate]);

  useEffect(() => {
    if (expiresAt === null) return;
    let timer: number;
    function expire() {
      window.clearTimeout(timer);
      const remaining = expiresAt! - Date.now();
      if (remaining <= 0) invalidate();
      else timer = window.setTimeout(expire, Math.min(remaining, maxTimeout));
    }
    expire();
    window.addEventListener("focus", expire);
    window.addEventListener("pageshow", expire);
    document.addEventListener("visibilitychange", expire);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("focus", expire);
      window.removeEventListener("pageshow", expire);
      document.removeEventListener("visibilitychange", expire);
    };
  }, [expiresAt, invalidate]);

  const onMonthChange = useCallback((month: string) => {
    setMonthRequest(current => current?.month === month ? current : { month });
  }, []);

  const ready = loadedDay?.value;
  const date = dayRequest.date ?? ready?.snapshot.businessDate;
  const dayError = failedDay === dayRequest;
  const day = loadedDay?.request === dayRequest ? ready : null;
  const month = loadedMonth?.request === monthRequest ? loadedMonth.value : emptyCalendar;
  const monthError = !!monthRequest && failedMonth === monthRequest;
  const retryDay = () => setDayRequest({ ...dayRequest });
  const switchLanguage = () => setChosenLocale(viewLocale === "en-US" ? "zh-CN" : "en-US");

  return <SnapshotPage locale={viewLocale} onSwitchLanguage={switchLanguage}>
    {unavailable ? <SnapshotStatus status="unavailable" locale={viewLocale} />
      : ready && date ? <DailySnapshotView
        storeName={ready.snapshot.storeName} employeeName={ready.snapshot.employee.displayName}
        date={date} minDate={ready.minDate} maxDate={ready.maxDate} locale={viewLocale} data={day ?? null}
        calendarData={month} calendarLoading={!!monthRequest && loadedMonth?.request !== monthRequest && !monthError}
        onSelectDate={selected => { if (selected !== date && selected >= ready.minDate && selected <= ready.maxDate) setDayRequest({ date: selected }); }}
        onMonthChange={onMonthChange}
        {...(monthError && { calendarRetry: () => setMonthRequest({ ...monthRequest }) })}
        {...(dayError && { dayRetry: retryDay })}
      /> : <SnapshotStatus status={dayError ? "error" : "loading"} locale={viewLocale} onRetry={retryDay} />}
  </SnapshotPage>;
}

function SnapshotPage({ locale, onSwitchLanguage, children }: { locale: AppLocale; onSwitchLanguage?: () => void; children: ReactNode }) {
  const en = locale === "en-US";
  return <main className="daily-snapshot-page daily-snapshot-page--shared" lang={locale} translate="no">
    <div className="daily-snapshot-share-bar">
      <span>Massage note</span>
      {onSwitchLanguage && <button type="button" lang={en ? "zh-CN" : "en-US"} onClick={onSwitchLanguage}>{en ? "中文" : "English"}</button>}
    </div>
    {children}
  </main>;
}

function SnapshotStatus({ status, locale, onRetry }: { status: "loading" | Failure; locale: AppLocale; onRetry?: () => void }) {
  const en = locale === "en-US";
  return <section className="daily-snapshot-state">
    <h1>{en ? "Daily work card" : "每日记工"}</h1>
    {status === "loading" ? <p role="status">{en ? "Loading daily work card…" : "正在读取每日记工…"}</p>
      : status === "unavailable" ? <p>{en ? "This link has expired or is unavailable. Ask the store for a new link." : "链接已过期或不可用，请向店铺索取新链接。"}</p>
      : <><p role="alert">{en ? "Unable to load the daily work card." : "暂时无法读取每日记工。"}</p><button className="secondary-action" type="button" onClick={onRetry}>{en ? "Retry" : "重试"}</button></>}
  </section>;
}
