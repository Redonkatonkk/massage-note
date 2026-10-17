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
    days: [{ businessDate: "2026-10-07", hours, count, lostCustomerCount: 0, revenueCents: "10000", averageCents: "10000", averageDayCount: 1, average30Cents: "10000", average30DayCount: 1, cumulativeAverageCents: "10000", cumulativeAverageDayCount: 1 }],
    weekdays: Array.from({ length: 7 }, (_, weekday) => ({ weekday, closedDayCount: weekday === 2 ? 1 : 0, calendarDayCount: weekday === 2 ? 1 : 0, averageCents: weekday === 2 ? "10000" : null, hours })),
  };
}
async function render() { await act(async () => root.render(<AnalyticsPanel storeId="store" today="2026-10-07" />)); }
function query() { return new URL(String(request.mock.calls.filter(([path]) => String(path).includes("/analytics?")).at(-1)![0]), "http://localhost").searchParams; }
async function changeHighlight(value: string) {
  await act(async () => {
    const select = container.querySelector("select")!;
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
function hourlyCount() { return container.querySelector(".analytics-card:has(.hourly-details) .analytics-hit")?.getAttribute("aria-label"); }
function weekdayChart() { return [...container.querySelectorAll<HTMLElement>(".analytics-card")].find(card => card.querySelector(".weekday-revenue-details"))!; }
function weekdayPoint(index: number) { return weekdayChart().querySelectorAll<SVGElement>(".analytics-hit")[index]!; }
async function clickPoint(point: SVGElement) { await act(async () => point.dispatchEvent(new MouseEvent("click", { bubbles: true }))); }

function weekdayStats(): FinanceAnalyticsResponse {
  const response = stats();
  return { ...response, dateFrom: "2026-09-28", dateTo: "2026-10-14", days: [
    ["2026-09-28", "12345"], ["2026-10-05", "0"], ["2026-10-06", "99000"], ["2026-10-12", null],
  ].map(([businessDate, revenueCents]) => ({ ...response.days[0]!, businessDate: businessDate!, revenueCents: revenueCents ?? null })) };
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  language.locale = "zh-CN"; request.mockReset(); request.mockImplementation(async path => String(path).includes("/summary?") ? { days: [] } : stats());
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });

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
  await act(async () => container.querySelector<SVGElement>(".analytics-card:has(.hourly-details) .analytics-hit")!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
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
  expect(container.textContent).toContain("当前范围没有经营数据。");
  expect(container.querySelector(".analytics-revenue-calendar")).not.toBeNull();
});

it("英文提供相同的三种筛选", async () => {
  language.locale = "en-US"; await render();
  expect([...container.querySelector("select")!.options].map(option => option.textContent)).toEqual(["Highlighted only", "Exclude highlighted", "All"]);
  await changeHighlight("ONLY_HIGHLIGHTED");
  expect(container.textContent).toContain("excludes card sales and tips");
});

it("营业额日历直接使用切换后的分析响应，历史范围与每日小计采用同一高光条件", async () => {
  request.mockImplementation(async path => {
    const url = new URL(String(path), "http://localhost");
    if (url.pathname.endsWith("/summary")) return { days: [] };
    const revenueCents = url.searchParams.get("highlightFilter") === "EXCLUDE_HIGHLIGHTED" ? "6000" : url.searchParams.get("highlightFilter") === "ONLY_HIGHLIGHTED" ? "4000" : "10000";
    const response = stats();
    return { ...response, dateFrom: "2026-09-30", days: response.days.map(day => ({ ...day, revenueCents })) };
  });
  await render();
  for (const [filter, revenue] of [["ALL", "100"], ["EXCLUDE_HIGHLIGHTED", "60"], ["ONLY_HIGHLIGHTED", "40"]]) {
    if (filter !== "ALL") await changeHighlight(filter!);
    expect(container.querySelector('.analytics-revenue-calendar time[datetime="2026-10-07"]')!.nextElementSibling!.textContent).toBe(revenue);
    const params = new URL(String(request.mock.calls.filter(([path]) => String(path).includes("/summary?")).at(-1)![0]), "http://localhost").searchParams;
    expect(params.get("dateFrom")).toBe("2026-09-30");
    expect(params.get("highlightFilter")).toBe(filter);
  }
  expect(request.mock.calls.some(([path]) => String(path).includes("open-work-dates"))).toBe(false);
});

it("点击星期自动展开各日期营业额，保留美分、零值与未日结，并能切换及重新展开", async () => {
  request.mockImplementation(async path => String(path).includes("/summary?") ? { days: [] } : weekdayStats());
  await render();
  const chart = weekdayChart();
  const table = chart.querySelector<HTMLDetailsElement>("details")!;
  expect(table.open).toBe(false);
  expect(table.textContent).toContain("点击图中的星期");
  await clickPoint(weekdayPoint(0));
  expect(table.open).toBe(true);
  expect(table.querySelector("summary")!.textContent).toContain("星期一");
  expect([...table.querySelectorAll("tbody tr")].map(row => [...row.querySelectorAll("td")].map(cell => cell.textContent))).toEqual([
    ["2026-09-28", "US$123.45"], ["2026-10-05", "US$0.00"], ["2026-10-12", "—"],
  ]);
  expect(weekdayPoint(0).getAttribute("aria-pressed")).toBe("true");
  await act(async () => weekdayPoint(1).dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
  expect(table.querySelector("summary")!.textContent).toContain("星期一");
  table.open = false;
  await clickPoint(weekdayPoint(1));
  expect(table.open).toBe(true);
  expect(table.querySelector("summary")!.textContent).toContain("星期二");
  expect(table.querySelector("tbody")!.textContent).toBe("2026-10-06US$990.00");
  expect(weekdayPoint(0).getAttribute("aria-pressed")).toBe("false");
  table.open = false;
  await clickPoint(weekdayPoint(1));
  expect(table.open).toBe(true);
  expect(request).toHaveBeenCalledTimes(2);
});

it("星期表支持键盘、无日期和英文，筛选切换后清除旧选择", async () => {
  language.locale = "en-US";
  request.mockImplementation(async path => {
    if (String(path).includes("/summary?")) return { days: [] };
    const response = weekdayStats();
    return String(path).includes("ONLY_HIGHLIGHTED") ? { ...response, days: response.days.map(day => ({ ...day, revenueCents: "4200" })) } : response;
  });
  await render();
  await act(async () => weekdayPoint(0).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(weekdayChart().querySelector("details")!.open).toBe(true);
  expect(weekdayChart().querySelector("summary")!.textContent).toContain("Mon");
  expect(weekdayChart().querySelector("th:nth-child(2)")!.textContent).toBe("Revenue");
  expect(weekdayChart().querySelector("tbody")!.textContent).toContain("$123.45");
  await act(async () => weekdayPoint(6).dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })));
  expect(weekdayChart().textContent).toContain("No dates for this weekday");
  await changeHighlight("ONLY_HIGHLIGHTED");
  expect(weekdayChart().querySelector("details")!.open).toBe(false);
  expect(weekdayChart().querySelector("tbody")).toBeNull();
  await clickPoint(weekdayPoint(0));
  expect(weekdayChart().querySelector("tbody")!.textContent).toContain("$42.00");
});

it("日历、星期平均、新曲线在前，其余图表保持原顺序，每日小计紧随热力图", async () => {
  await render();
  const chartGrid = container.querySelector(".analytics-heatmap")!.parentElement!;
  const report = container.querySelector(".finance-report-section")!;
  expect(chartGrid.nextElementSibling).toBe(report);
  expect([...chartGrid.children].map(card => card.querySelector("h2")!.textContent)).toEqual([
    "每日营业额日历", "星期平均营业额", "平均营业额曲线", "流水与收入柱状图", "按小时上工数量", "每日记工数量", "每日营业额趋势", "星期 × 小时热力图",
  ]);
});

it("第四位柱图复用每日小计请求，周期切换不重取，筛选后展示同一条件的最新金额", async () => {
  request.mockImplementation(async path => {
    if (!String(path).includes("/summary?")) return stats();
    const amount = String(path).includes("ONLY_HIGHLIGHTED") ? 4200 : 10000;
    return { days: [{ businessDate: "2026-10-07", dailyTurnoverCents: amount, storeIncomeCents: amount / 2, totalIncomeCents: amount * .8, recentClosedRevenue: null,
      mainServiceAmountCents: amount, addonTotalCents: 0, grossFeeBaseCents: amount, discountTotalCents: 0, discountedFeePerformanceCents: amount,
      giftCardSalesAmountCents: 0, giftCardRedemptionCents: 0, employeeIncomeCents: amount / 2,
    }] };
  });
  await render();
  expect(request).toHaveBeenCalledTimes(2);
  expect(container.querySelector(".analytics-income-bars tbody")!.textContent).toContain("总流水 US$100.00 · 店铺收入 US$50.00 · 总收入 US$80.00");
  await act(async () => {
    const select = container.querySelector<HTMLSelectElement>(".analytics-income-bars select")!;
    select.value = "DAY"; select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(request).toHaveBeenCalledTimes(2);
  await changeHighlight("ONLY_HIGHLIGHTED");
  expect(container.querySelector(".analytics-income-bars tbody")!.textContent).toContain("总流水 US$42.00 · 店铺收入 US$21.00 · 总收入 US$33.60");
  expect(request).toHaveBeenCalledTimes(4);
});

it("平均曲线默认30天，可同时选择三条并保留各自数值、样本和当前筛选", async () => {
  await render();
  const chart = container.querySelector(".analytics-average-revenue")!;
  const choices = [...chart.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  expect(choices.map(input => input.checked)).toEqual([true, false, false]);
  expect([...chart.querySelectorAll("path")].map(path => path.getAttribute("data-series"))).toEqual(["30"]);
  const calls = request.mock.calls.length;
  await act(async () => { choices[1]!.click(); choices[2]!.click(); });
  expect([...chart.querySelectorAll("path")].map(path => path.getAttribute("data-series"))).toEqual(["30", "all", "7"]);
  await clickPoint(chart.querySelector<SVGElement>(".analytics-hit")!);
  expect(chart.querySelector(".analytics-readout")!.textContent).toContain("全日期累计平均 US$100.00 · 1 个已日结日");
  expect(chart.querySelector("tbody")!.textContent).toContain("最近7天平均 US$100.00");
  expect(request.mock.calls.length).toBe(calls);
  await act(async () => choices.forEach(input => input.click()));
  expect(chart.querySelectorAll("path")).toHaveLength(0);
  expect(chart.textContent).toContain("请至少选择一条曲线");
  await changeHighlight("ONLY_HIGHLIGHTED");
  expect(container.querySelector<HTMLInputElement>('.analytics-average-revenue input[type="checkbox"]')!.checked).toBe(true);
});

it("全年日期仍使用固定宽度和平滑曲线，并保留日期两端和未日结缺口", async () => {
  request.mockImplementation(async path => {
    if (String(path).includes("/summary?")) return { days: [] };
    const response = stats();
    return { ...response, dateFrom: "2025-10-08", days: Array.from({ length: 365 }, (_, index) => ({
      ...response.days[0]!, businessDate: new Date(Date.UTC(2025, 9, 8 + index)).toISOString().slice(0, 10),
      average30Cents: index === 1 ? null : String(10000 + index * 50),
    })) };
  });
  await render();
  for (const plot of container.querySelectorAll(".analytics-plot")) {
    expect(plot.closest(".analytics-scroll")).toBeNull();
    expect(plot.querySelector("svg")!.getAttribute("width")).toBe("100%");
    expect(plot.querySelector("svg")!.getAttribute("viewBox")).toBe("0 0 600 270");
  }
  const chart = container.querySelector(".analytics-average-revenue")!;
  const path = chart.querySelector("path")!.getAttribute("d")!;
  expect(path).toContain("C");
  expect(path.match(/M/g)).toHaveLength(2);
  expect(chart.querySelector(".analytics-plot > svg")!.textContent).toContain("10-08");
  expect(chart.querySelector(".analytics-plot > svg")!.textContent).toContain("10-07");
  expect(chart.querySelectorAll(".analytics-hit")).toHaveLength(365);
});

it("英文平均曲线选项及累计口径完整可读", async () => {
  language.locale = "en-US";
  await render();
  const chart = container.querySelector(".analytics-average-revenue")!;
  expect(chart.textContent).toContain("Average revenue curves");
  expect([...chart.querySelectorAll("label")].map(label => label.textContent)).toEqual(["Trailing 30-day average", "Cumulative average", "Trailing 7-day average"]);
  expect(chart.textContent).toContain("from the selected start through each date");
});

it("容器变窄时重新分配横轴，在手机宽度保留首末日期和固定图高", async () => {
  const callbacks: ResizeObserverCallback[] = [];
  const disconnect = vi.fn();
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { callbacks.push(callback); }
    observe() {}
    disconnect = disconnect;
  });
  request.mockImplementation(async path => {
    if (String(path).includes("/summary?")) return { days: [] };
    const response = stats();
    return { ...response, dateFrom: "2026-10-06", days: [{ ...response.days[0]!, businessDate: "2026-10-06" }, response.days[0]!] };
  });
  await render();
  await act(async () => callbacks.forEach(callback => callback([{ contentRect: { width: 280 } }] as ResizeObserverEntry[], {} as ResizeObserver)));
  for (const svg of container.querySelectorAll(".analytics-plot > svg")) {
    expect(svg.getAttribute("viewBox")).toBe("0 0 280 270");
    expect(svg.getAttribute("height")).toBe("270");
  }
  const svg = container.querySelector(".analytics-average-revenue .analytics-plot > svg")!;
  expect(svg.textContent).toContain("10-06");
  expect(svg.textContent).toContain("10-07");
  await changeHighlight("ONLY_HIGHLIGHTED");
  expect(disconnect).toHaveBeenCalledTimes(3);
});
