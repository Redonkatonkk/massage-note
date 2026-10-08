// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { FinanceAnalyticsResponse } from "@massage-note/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api";
import { AnalyticsPanel } from "./analytics-panel";

vi.mock("../../lib/api", () => ({ apiRequest: vi.fn(), errorMessage: (error: Error) => error.message }));
vi.mock("../../lib/realtime", () => ({ useStoreRealtime: () => {} }));
const language = vi.hoisted(() => ({ locale: "zh-CN" }));
vi.mock("../language-provider", () => ({ useLanguage: () => language }));
const request = vi.mocked(apiRequest);
let root: Root;
let container: HTMLDivElement;

function stats(count = 2): FinanceAnalyticsResponse {
  const hours = Array.from({ length: 24 }, (_, hour) => hour === 10 ? count : 0);
  return { dateFrom: "2026-10-07", dateTo: "2026-10-07", hasData: count > 0,
    hours: hours.map((value, hour) => ({ hour, count: value })),
    days: [{ businessDate: "2026-10-07", hours, count, lostCustomerCount: 0, revenueCents: "10000", averageCents: "10000", averageDayCount: 1 }],
    weekdays: Array.from({ length: 7 }, (_, weekday) => ({ weekday, closedDayCount: weekday === 2 ? 1 : 0, calendarDayCount: weekday === 2 ? 1 : 0, averageCents: weekday === 2 ? "10000" : null, hours })),
  };
}
async function render() { await act(async () => root.render(<AnalyticsPanel storeId="store" today="2026-10-07" />)); }
function query() { return new URL(String(request.mock.calls.at(-1)![0]), "http://localhost").searchParams; }
async function changeHighlight(value: string) {
  await act(async () => {
    const select = container.querySelector("select")!;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
function hourlyCount() { return container.querySelector(".analytics-card .analytics-hit")?.getAttribute("aria-label"); }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  language.locale = "zh-CN"; request.mockReset(); request.mockResolvedValue(stats());
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it("默认全部，切换三种高光筛选立即刷新，并保留独立日期范围", async () => {
  await render();
  const select = container.querySelector("select")!;
  expect(select.value).toBe("ALL");
  expect([...select.options].map(option => option.textContent)).toEqual(["仅高光", "排除高光", "全部"]);
  expect(query().get("highlightFilter")).toBe("ALL");
  expect(query().has("dateFrom")).toBe(false);
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "最近7天")!.click());
  for (const value of ["ONLY_HIGHLIGHTED", "EXCLUDE_HIGHLIGHTED", "ALL"]) {
    await changeHighlight(value);
    expect(query().get("highlightFilter")).toBe(value);
    expect(query().get("dateFrom")).toBe("2026-10-01");
    expect(query().get("dateTo")).toBe("2026-10-07");
    expect([...container.querySelectorAll<HTMLInputElement>("input[type=date]")].map(input => input.value)).toEqual(["2026-10-01", "2026-10-07"]);
  }
  await changeHighlight("ONLY_HIGHLIGHTED");
  expect(container.textContent).toContain("不含卖卡实收与小费");
  expect(container.textContent).toContain("跑客人数不受高光筛选影响");
});

it("快速切换后丢弃旧筛选的延迟响应，图表选中明细同步重置", async () => {
  await render();
  await act(async () => container.querySelector<SVGElement>(".analytics-card .analytics-hit")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  expect(container.querySelector(".hourly-details__period")).not.toBeNull();
  let resolveOld!: (data: FinanceAnalyticsResponse) => void;
  request.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve; }));
  await changeHighlight("ONLY_HIGHLIGHTED");
  expect(container.querySelector(".analytics-grid")).toBeNull();
  request.mockResolvedValueOnce(stats(3));
  await changeHighlight("EXCLUDE_HIGHLIGHTED");
  expect(hourlyCount()).toContain("3 笔");
  expect(container.querySelector(".hourly-details__period")).toBeNull();
  await act(async () => resolveOld(stats(9)));
  expect(hourlyCount()).toContain("3 笔");
  expect(container.querySelector("select")!.value).toBe("EXCLUDE_HIGHLIGHTED");
});

it("筛选失败可重试当前条件，空结果沿用空状态", async () => {
  await render(); request.mockRejectedValueOnce(new Error("暂时无法读取"));
  await changeHighlight("ONLY_HIGHLIGHTED");
  expect(container.querySelector("[role=alert]")!.textContent).toContain("暂时无法读取");
  expect(container.querySelector(".analytics-grid")).toBeNull();
  request.mockResolvedValueOnce(stats(0));
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "重试")!.click());
  expect(query().get("highlightFilter")).toBe("ONLY_HIGHLIGHTED");
  expect(container.querySelector(".empty-state")!.textContent).toBe("当前范围没有经营数据。");
});

it("英文提供相同的三种筛选", async () => {
  language.locale = "en-US"; await render();
  expect([...container.querySelector("select")!.options].map(option => option.textContent)).toEqual(["Highlighted only", "Exclude highlighted", "All"]);
  await changeHighlight("ONLY_HIGHLIGHTED");
  expect(container.textContent).toContain("excludes card sales and tips");
});
