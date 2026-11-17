// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DailySnapshotResponse } from "@massage-note/contracts";
import { dailySnapshotFixtures, getPreviewMonthToDate } from "../../preview/daily-snapshot/fixtures";
import { SharedDailySnapshot } from "./shared-daily-snapshot";

const token = "a".repeat(43);
const request = vi.fn<typeof fetch>();
let host: HTMLDivElement, root: Root;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  request.mockReset();
  vi.stubGlobal("fetch", request);
  window.history.replaceState(null, "", `/share/daily-snapshot#${token}`);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function response(date = "2026-11-15", expiresAt = new Date(Date.now() + 60_000).toISOString()) {
  const snapshot = dailySnapshotFixtures.find(entry => entry.businessDate === date)!;
  const value: DailySnapshotResponse = {
    snapshot, monthToDate: getPreviewMonthToDate(date), minDate: "2026-10-25", maxDate: "2026-11-16", expiresAt, locale: "en_US",
  };
  return Response.json(value);
}

function open() { return act(async () => root.render(<SharedDailySnapshot />)); }
function button(label: string) { return host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!; }
function earnings() { return host.querySelector(".daily-snapshot-income strong")?.textContent; }
function calendarResponse() { return Response.json({ dates: [], closedDates: [{ date: "2026-11-15", revenueCents: 26500 }] }); }

it("only reads a fragment credential and authenticates both no-store reads with a header", async () => {
  window.history.replaceState(null, "", `/share/daily-snapshot?token=${token}`);
  await open();
  expect(host.textContent).toContain("链接已过期或不可用");
  expect(request).not.toHaveBeenCalled();

  request.mockImplementation(async input => String(input).includes("/calendar?") ? calendarResponse() : response());
  await act(async () => {
    window.history.replaceState(null, "", `/share/daily-snapshot#${token}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
  expect(host.querySelector("main")?.lang).toBe("en-US");
  expect(earnings()).toBe("$265.00");
  expect(host.querySelector(".daily-snapshot-sources tfoot")?.textContent).toContain("$402.00");
  expect(button("November 15, 2026").textContent).toBe("15265");
  expect(request.mock.calls.map(([url]) => new URL(String(url)).pathname)).toEqual([
    "/api/v1/public/daily-snapshots", "/api/v1/public/daily-snapshots/calendar",
  ]);
  for (const [url, options] of request.mock.calls) {
    expect(String(url)).not.toContain(token);
    expect(options).toMatchObject({ headers: { Authorization: `Bearer ${token}` }, credentials: "omit", cache: "no-store", redirect: "error", referrerPolicy: "no-referrer" });
  }
});

it("keeps date controls mounted, hides mismatched totals, and ignores a superseded day response", async () => {
  let resolvePrior!: (value: Response) => void;
  const prior = new Promise<Response>(resolve => { resolvePrior = resolve; });
  request.mockImplementation(async input => {
    const url = new URL(String(input));
    if (url.pathname.endsWith("/calendar")) return calendarResponse();
    const date = url.searchParams.get("date");
    if (date === "2026-11-14") return prior;
    return response(date ?? undefined);
  });
  await open();
  await act(async () => button("Previous day").click());
  expect(host.textContent).toContain("Loading this date…");
  expect(earnings()).toBeUndefined();
  expect(host.querySelector(".daily-snapshot-calendar")).not.toBeNull();
  expect(host.querySelector(".daily-snapshot-sources tfoot")).toBeNull();

  await act(async () => button("November 13, 2026").click());
  expect(earnings()).toBe("$42.00");
  expect(request.mock.calls.find(([url]) => String(url).endsWith("date=2026-11-14"))?.[1]?.signal?.aborted).toBe(true);
  await act(async () => resolvePrior(response("2026-11-14")));
  expect(earnings()).toBe("$42.00");
  expect(host.querySelector(".daily-snapshot-selected-date")?.textContent).toBe("2026-11-13");

  await act(async () => button("Previous month").click());
  expect(request.mock.calls.some(([url]) => String(url).endsWith("/calendar?month=2026-10"))).toBe(true);
  expect(button("October 24, 2026").disabled).toBe(true);
  expect(button("October 25, 2026").disabled).toBe(false);
});

it("retries a temporary error, then removes the personal statement at expiry", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-16T20:00:00Z"));
  const expiresAt = new Date(Date.now() + 1000).toISOString();
  request.mockImplementationOnce(async () => new Response("{}", { status: 503 }));
  request.mockImplementation(async input => String(input).includes("/calendar?") ? calendarResponse() : response("2026-11-15", expiresAt));
  await open();
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await act(async () => host.querySelector<HTMLButtonElement>(".daily-snapshot-state button")!.click());
  expect(earnings()).toBe("$265.00");
  await act(async () => vi.advanceTimersByTime(1000));
  expect(host.textContent).toContain("This link has expired or is unavailable.");
  expect(host.textContent).not.toContain("Lily");
  expect(host.querySelector(".daily-snapshot-calendar")).toBeNull();
  expect(host.querySelector(".daily-snapshot-sources")).toBeNull();
});
