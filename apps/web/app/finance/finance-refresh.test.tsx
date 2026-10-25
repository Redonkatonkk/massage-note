// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { demoRequest } from "../../demo/client";
import { apiRequest } from "../../lib/api";
import { FinancePageClient } from "./finance-page-client";

vi.mock("../../lib/api", () => ({
  apiBase: "/api/v1", apiRequest: vi.fn(), ApiError: class extends Error {},
  errorMessage: (error: Error) => error.message,
}));

class FakeSource extends EventTarget {
  static instances: FakeSource[] = [];
  onopen?: () => void;
  closed = false;
  constructor(_url: string) { super(); FakeSource.instances.push(this); }
  close() { this.closed = true; }
  change() { this.dispatchEvent(new MessageEvent("store.changed", { data: JSON.stringify({ entityType: "work_record", businessDate: "2026-10-22" }) })); }
}

const request = vi.mocked(apiRequest);
let root: Root;
let container: HTMLDivElement;
const button = (label: string) => [...container.querySelectorAll("button")].find(item => item.textContent === label)!;
const click = async (label: string) => act(async () => button(label).click());

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("EventSource", FakeSource);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  FakeSource.instances = [];
  request.mockReset(); request.mockImplementation(async path => demoRequest(String(path)));
  window.localStorage.clear();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  vi.useRealTimers(); vi.unstubAllGlobals();
});

it.each(["summary", "analytics"])("keeps %s stable across idle time and foreground/network recovery; refresh reloads the full report", async tab => {
  window.history.replaceState(null, "", `/finance?tab=${tab}`);
  await act(async () => root.render(<FinancePageClient />));
  expect(container.querySelector(tab === "summary" ? ".monthly-finance" : ".analytics-panel")).not.toBeNull();
  expect(container.querySelector(".sync-status")).toBeNull();
  expect(FakeSource.instances).toHaveLength(0);
  expect(container.querySelector(".form-error")).toBeNull();
  request.mockClear();
  await act(async () => {
    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new Event("online"));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    await vi.advanceTimersByTimeAsync(61_000);
  });
  expect(request).not.toHaveBeenCalled();
  await click("刷新");
  expect(request).toHaveBeenCalledTimes(tab === "summary" ? 4 : 2);
  expect(request.mock.calls.filter(([path]) => String(path).includes("/finance/summary?"))).toHaveLength(tab === "summary" ? 3 : 1);
  expect(request.mock.calls.filter(([path]) => String(path).includes("/finance/analytics?"))).toHaveLength(1);
});

it("keeps daily closing live and unsubscribes when returning to a report", async () => {
  window.history.replaceState(null, "", "/finance?tab=closing");
  await act(async () => root.render(<FinancePageClient />));
  const source = FakeSource.instances[0]!;
  expect(source).toBeDefined();
  expect(source.closed).toBe(false);
  request.mockClear();
  await act(async () => {
    source.change();
    await vi.advanceTimersByTimeAsync(250);
  });
  expect(request.mock.calls.some(([path]) => String(path).includes("/closings/2026-10-22/preview"))).toBe(true);
  await click("月度汇总");
  expect(source.closed).toBe(true);
  request.mockClear();
  await act(async () => {
    source.change();
    await vi.advanceTimersByTimeAsync(61_000);
  });
  expect(request).not.toHaveBeenCalled();
});
