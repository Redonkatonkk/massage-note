// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SharedSettlement } from "./shared-settlement";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams({ token: "a".repeat(43) }) }));
const snapshot = {
  storeName: "Store", storeTimezone: "America/New_York", employee: { displayName: "Amy" },
  dateFrom: "2026-10-01", dateTo: "2026-10-31", generatedAt: "2026-11-02T12:00:00Z", paymentScope: "ALL",
  summary: { totalIncomeCents: 2345, cashLargeFeeWageCents: 2345, nonCashLargeFeeWageCents: 0, cashTipCents: 0, nonCashTipCents: 0 }, records: [],
};
let root: Root, host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("匿名读取日期和合计，合计在按日记工前；到期后移除内容", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-02T12:00:00Z"));
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ snapshot, createdAt: "2026-11-02T12:00:00Z", expiresAt: "2026-11-02T12:00:01Z" })));
  vi.stubGlobal("fetch", fetch);
  await act(async () => root.render(<SharedSettlement />));
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/public/employee-settlements/"), expect.objectContaining({ credentials: "omit", cache: "no-store" }));
  expect(host.textContent).toContain("结算日期 2026-10-01 — 2026-10-31");
  expect(host.textContent).toContain("$23.45");
  expect(host.textContent!.indexOf("收入合计")).toBeLessThan(host.textContent!.indexOf("按日记工"));
  expect(host.textContent).toContain("没有符合条件的已确认记工");
  await act(async () => vi.advanceTimersByTime(1000));
  expect(host.textContent).toContain("分享链接已过期或不存在");
  expect(host.textContent).not.toContain("Amy");
});

it("无效链接显示失效，网络错误允许重试", async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(new Response("{}", { status: 404 }));
  vi.stubGlobal("fetch", fetch);
  await act(async () => root.render(<SharedSettlement />));
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent === "重试")!.click());
  expect(host.textContent).toContain("分享链接已过期或不存在");
  expect(host.querySelector('[role="alert"]')).toBeNull();
});
