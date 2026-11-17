// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BusinessDatePicker } from "./business-date-picker";
import { apiRequest } from "../lib/api";
import { createBusinessDateCalendarCache, type OpenWorkDatesResponse } from "../lib/business-date-calendar-cache";

vi.mock("../lib/api", () => ({ apiRequest: vi.fn() }));
const marks: OpenWorkDatesResponse = {
  dates: ["2026-11-16"],
  closedDates: [{ date: "2026-11-15", discountedFeePerformanceCents: 29500, revenueCents: 26500 }],
};
let host: HTMLDivElement, root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.mocked(apiRequest).mockReset();
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
function button(label: string) { return host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!; }

it("keeps supplied inline calendar data visible, applies date bounds and avoids API and cache access", async () => {
  const cache = createBusinessDateCalendarCache();
  const peek = vi.spyOn(cache, "peek"), load = vi.spyOn(cache, "load");
  const change = vi.fn();
  await act(async () => root.render(<BusinessDatePicker inline storeId="preview" value="2026-11-15" min="2026-11-12" max="2026-11-16" calendarData={marks} cache={cache} ariaLabel="记工日期" onChange={change} />));
  expect(host.querySelector(".business-date-picker__trigger")).toBeNull();
  expect(host.querySelector('[role="group"]')!.getAttribute("aria-busy")).toBe("false");
  expect(button("上个月").disabled).toBe(true);
  expect(button("下个月").disabled).toBe(true);
  expect(button("2026 年 11 月 11 日").disabled).toBe(true);
  expect(button("2026 年 11 月 17 日").disabled).toBe(true);
  const selected = button("2026 年 11 月 15 日");
  expect(selected.getAttribute("aria-pressed")).toBe("true");
  expect(selected.querySelector("small")!.textContent).toBe("265");
  expect(button("2026 年 11 月 16 日，有记工但未日结").classList.contains("has-open-work")).toBe(true);
  await act(async () => { button("2026 年 11 月 11 日").click(); button("2026 年 11 月 14 日").click(); });
  expect(change).toHaveBeenCalledExactlyOnceWith("2026-11-14");
  expect(host.querySelector(".business-date-picker__popover")).not.toBeNull();
  expect(apiRequest).not.toHaveBeenCalled();
  expect(peek).not.toHaveBeenCalled();
  expect(load).not.toHaveBeenCalled();
});

it("localizes English and permits only months and dates within the supplied window", async () => {
  const change = vi.fn();
  await act(async () => root.render(<BusinessDatePicker inline storeId="preview" value="2026-11-15" min="2026-10-30" max="2026-12-02" calendarData={marks} locale="en-US" ariaLabel="Work date" onChange={change} />));
  expect(host.querySelector('[role="group"]')!.getAttribute("aria-label")).toBe("Work date calendar");
  expect(host.querySelector("header strong")!.textContent).toBe("November 2026");
  expect(host.querySelector(".business-date-picker__weekdays")!.textContent).toBe("SunMonTueWedThuFriSat");
  expect(button("November 16, 2026, work recorded, not closed")).not.toBeNull();
  await act(async () => button("Previous month").click());
  expect(host.querySelector("header strong")!.textContent).toBe("October 2026");
  expect(button("Previous month").disabled).toBe(true);
  expect(button("October 29, 2026").disabled).toBe(true);
  expect(button("October 30, 2026").disabled).toBe(false);
  await act(async () => button("Next month").click());
  await act(async () => button("Next month").click());
  expect(host.querySelector("header strong")!.textContent).toBe("December 2026");
  expect(button("Next month").disabled).toBe(true);
  expect(button("December 3, 2026").disabled).toBe(true);
  await act(async () => button("December 2, 2026").click());
  expect(change).toHaveBeenCalledExactlyOnceWith("2026-12-02");
  expect(apiRequest).not.toHaveBeenCalled();
});

it("retains the original API-backed Chinese calendar when no supplied data is provided", async () => {
  vi.mocked(apiRequest).mockResolvedValue(marks);
  await act(async () => root.render(<BusinessDatePicker inline storeId="store" value="2026-11-15" max="2026-11-16" ariaLabel="日期" onChange={() => undefined} />));
  expect(apiRequest).toHaveBeenCalledExactlyOnceWith("/stores/store/business-days/open-work-dates?dateFrom=2026-11-01&dateTo=2026-11-30");
  expect(host.querySelector("header strong")!.textContent).toBe("2026 年 11 月");
  expect(button("上个月").disabled).toBe(false);
  expect(button("2026 年 11 月 15 日").querySelector("small")!.textContent).toBe("265");
  expect(button("2026 年 11 月 16 日，有记工但未日结").classList.contains("has-open-work")).toBe(true);
});
