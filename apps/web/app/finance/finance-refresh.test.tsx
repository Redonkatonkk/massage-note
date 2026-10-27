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

it("queries the selected highlights across the complete monthly report, details and export", async () => {
  window.history.replaceState(null, "", "/finance?tab=summary");
  await act(async () => root.render(<FinancePageClient />));
  const choices = [...container.querySelectorAll<HTMLInputElement>('.monthly-finance__filters input[type="checkbox"]')];
  expect(choices.map(input => input.checked)).toEqual([true, true]);
  for (const [nonHighlighted, highlighted, filter] of [[true, false, "EXCLUDE_HIGHLIGHTED"], [false, true, "ONLY_HIGHLIGHTED"], [true, true, "ALL"]] as const) {
    request.mockClear();
    await act(async () => {
      if (choices[0]!.checked !== nonHighlighted) choices[0]!.click();
      if (choices[1]!.checked !== highlighted) choices[1]!.click();
    });
    expect(request).not.toHaveBeenCalled();
    await click("查询");
    const reports = request.mock.calls.filter(([path]) => /\/finance\/(summary|analytics)\?/.test(String(path)));
    expect(reports).toHaveLength(4);
    expect(reports.every(([path]) => new URL(String(path), "http://local").searchParams.get("highlightFilter") === filter)).toBe(true);
    expect(container.querySelector(".form-error")).toBeNull();
    expect(new URL(container.querySelector<HTMLAnchorElement>(".export-link")!.href).searchParams.get("highlightFilter")).toBe(filter);
    await act(async () => container.querySelector<HTMLButtonElement>(".monthly-finance__metrics button")!.click());
    const detailsPath = request.mock.calls.find(([path]) => String(path).includes("/finance/details?"))![0];
    expect(new URL(String(detailsPath), "http://local").searchParams.get("highlightFilter")).toBe(filter);
    request.mockClear();
    await click("查询");
    expect(request.mock.calls.filter(([path]) => /\/finance\/(summary|analytics)\?/.test(String(path)))).toHaveLength(4);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    request.mockClear();
    await click("刷新");
    expect(request.mock.calls.filter(([path]) => /\/finance\/(summary|analytics)\?/.test(String(path)))).toHaveLength(4);
    expect(request.mock.calls.every(([path]) => new URL(String(path), "http://local").searchParams.get("highlightFilter") === filter)).toBe(true);
  }
});

it("retries a failed monthly query using its applied highlight condition", async () => {
  window.history.replaceState(null, "", "/finance?tab=summary");
  await act(async () => root.render(<FinancePageClient />));
  await act(async () => container.querySelector<HTMLInputElement>('.monthly-finance__filters input[type="checkbox"]')!.click());
  request.mockRejectedValueOnce(new Error("Summary offline"));
  await click("查询");
  expect(container.querySelector(".monthly-finance__metrics")!.textContent).not.toContain("$");
  expect(container.querySelector(".export-link")).toBeNull();
  expect(container.textContent).toContain("本月财务暂时无法读取");
  request.mockClear();
  await click("重新加载");
  const reports = request.mock.calls.filter(([path]) => /\/finance\/(summary|analytics)\?/.test(String(path)));
  expect(reports).toHaveLength(4);
  expect(reports.every(([path]) => new URL(String(path), "http://local").searchParams.get("highlightFilter") === "ONLY_HIGHLIGHTED")).toBe(true);
  expect(container.querySelector(".export-link")).not.toBeNull();
});
