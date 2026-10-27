// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { FinanceAnalyticsResponse } from "@massage-note/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api";
import { AnalyticsPanel } from "./analytics-panel";

vi.mock("../../lib/api", () => ({ apiRequest: vi.fn(), errorMessage: (error: Error) => error.message }));
const language = vi.hoisted(() => ({ locale: "zh-CN" }));
vi.mock("../language-provider", () => ({ useLanguage: () => language }));
const request = vi.mocked(apiRequest);
let root: Root;
let container: HTMLDivElement;

function stats(count = 2): FinanceAnalyticsResponse {
  const hours = Array.from({ length: 24 }, (_, hour) => hour === 10 ? count : 0);
  return { dateFrom: "2026-10-07", dateTo: "2026-10-07", hasData: count > 0, trends: null,
    weekdayComparison: { hasData: count > 0,
      days: [{ businessDate: "2026-10-07", highlightedRevenueCents: "4000", nonHighlightedRevenueCents: "6000", revenueCents: "10000" }],
      weekdays: Array.from({ length: 7 }, (_, weekday) => ({ weekday, closedDayCount: weekday === 2 ? 1 : 0, highlightedAverageCents: weekday === 2 ? "4000" : null, nonHighlightedAverageCents: weekday === 2 ? "6000" : null, averageCents: weekday === 2 ? "10000" : null })),
    },
    hours: hours.map((value, hour) => ({ hour, count: value })),
    days: [{ businessDate: "2026-10-07", hours, count, lostCustomerCount: 0, revenueCents: "10000", averageCents: "10000", averageDayCount: 1, average30Cents: "10000", average30DayCount: 1, cumulativeAverageCents: "10000", cumulativeAverageDayCount: 1 }],
    weekdays: Array.from({ length: 7 }, (_, weekday) => ({ weekday, closedDayCount: weekday === 2 ? 1 : 0, calendarDayCount: weekday === 2 ? 1 : 0, averageCents: weekday === 2 ? "10000" : null, hours })),
  };
}
async function render(storeId = "store") { await act(async () => root.render(<AnalyticsPanel storeId={storeId} today="2026-10-07" />)); }
function trendStats(value: string): FinanceAnalyticsResponse {
  const response = stats();
  const metric = { current: { dateFrom: "2026-09-08", dateTo: "2026-10-07", closedDayCount: 30, value },
    previous: { dateFrom: "2026-08-09", dateTo: "2026-09-07", closedDayCount: 20, value: "10000" },
    changeTenthsPercent: 200, difference: "2000", direction: "UP" as const, status: "COMPARABLE" as const };
  return { ...response, trends: { asOf: "2026-10-07", revenue7: metric, revenue30: metric, records30: { ...metric, current: { ...metric.current, value: "1.2" } }, income30: metric } };
}
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
  const days = [
    ["2026-09-28", "12345"], ["2026-10-05", "0"], ["2026-10-06", "99000"], ["2026-10-12", null],
  ].map(([businessDate, revenueCents]) => ({ ...response.days[0]!, businessDate: businessDate!, revenueCents: revenueCents ?? null }));
  return { ...response, dateFrom: "2026-09-28", dateTo: "2026-10-14", days,
    weekdayComparison: { ...response.weekdayComparison, days: days.map(day => ({ businessDate: day.businessDate, highlightedRevenueCents: day.revenueCents === null ? null : "0", nonHighlightedRevenueCents: day.revenueCents, revenueCents: day.revenueCents })) },
  };
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

it("趋势不等待每日小计，失败后仍可手动刷新图表和小计", async () => {
  let latest = "12001";
  request.mockImplementation(async path => {
    if (String(path).includes("/summary?")) throw new Error("小计失败");
    return trendStats(latest);
  });
  await render();
  expect(container.querySelector('.analytics-overview [data-metric="revenue7"]')!.textContent).toContain("$120.01");
  expect(container.textContent).toContain("小计失败");
  expect(request).toHaveBeenCalledTimes(2);
  latest = "23456";
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "刷新")!.click());
  expect(container.querySelector('.analytics-overview [data-metric="revenue7"]')!.textContent).toContain("$234.56");
  expect(request.mock.calls.filter(([path]) => String(path).includes("/analytics?")).length).toBe(2);
  expect(request.mock.calls.filter(([path]) => String(path).includes("/summary?")).length).toBe(2);
});

it("趋势切换筛选和店铺时先清除旧值，延迟响应不能覆盖当前卡片，失败可重试", async () => {
  request.mockImplementation(async path => String(path).includes("/summary?") ? { days: [] } : trendStats("12001"));
  await render();
  let resolveOld!: (value: FinanceAnalyticsResponse) => void;
  request.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
  await changeHighlight("ONLY_HIGHLIGHTED");
  expect(container.querySelector(".analytics-overview")!.textContent).not.toContain("$120.01");
  request.mockResolvedValueOnce(trendStats("23456"));
  await changeHighlight("EXCLUDE_HIGHLIGHTED");
  await act(async () => resolveOld(trendStats("99999")));
  expect(container.querySelector(".analytics-overview")!.textContent).toContain("$234.56");
  expect(container.querySelector(".analytics-overview")!.textContent).not.toContain("$999.99");
  let resolveStore!: (value: FinanceAnalyticsResponse) => void;
  request.mockReturnValueOnce(new Promise(resolve => { resolveStore = resolve; }));
  await render("second-store");
  expect(container.querySelector(".analytics-overview")!.textContent).not.toContain("$234.56");
  await act(async () => resolveStore(trendStats("34567")));
  expect(container.querySelector(".analytics-overview")!.textContent).toContain("$345.67");
  request.mockRejectedValueOnce(new Error("趋势失败"));
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "刷新")!.click());
  expect(container.querySelector(".analytics-overview")!.textContent).not.toContain("$345.67");
  request.mockResolvedValueOnce(trendStats("45678"));
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "重试")!.click());
  expect(container.querySelector(".analytics-overview")!.textContent).toContain("$456.78");
  expect(String(request.mock.calls.filter(([path]) => String(path).includes("/analytics?")).at(-1)![0])).toContain("/stores/second-store/");
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

it("切换语言复用已加载的图表和小计，刷新仍沿用当前筛选", async () => {
  await render();
  await changeHighlight("ONLY_HIGHLIGHTED");
  request.mockClear();
  language.locale = "en-US";
  await render();
  expect(container.textContent).toContain("Daily subtotals");
  expect(request).not.toHaveBeenCalled();
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "Refresh")!.click());
  expect(request).toHaveBeenCalledTimes(2);
  expect(request.mock.calls.every(([path]) => new URL(String(path), "http://localhost").searchParams.get("highlightFilter") === "ONLY_HIGHLIGHTED")).toBe(true);
});

it("星期图固定同时显示高光、非高光、全部及金额，不随页面筛选隐藏或另发比较请求", async () => {
  await render();
  for (const filter of ["ALL", "ONLY_HIGHLIGHTED", "EXCLUDE_HIGHLIGHTED"]) {
    if (filter !== "ALL") await changeHighlight(filter);
    const chart = weekdayChart();
    expect([...chart.querySelectorAll(".analytics-income-legend li")].map(item => item.textContent)).toEqual(["高光", "非高光", "全部"]);
    expect([...chart.querySelectorAll("rect[data-series]")].map(bar => bar.getAttribute("data-series"))).toEqual(["highlighted", "non-highlighted", "all"]);
    expect([...chart.querySelectorAll(".analytics-bar-value")].filter(label => label.textContent !== "—").map(label => label.textContent)).toEqual(["$40", "$60", "$100"]);
  }
  expect(request.mock.calls.filter(([path]) => String(path).includes("/analytics?")).length).toBe(3);
});

it("当前筛选无记录时仍可比较其他分组的星期营业额", async () => {
  const response = stats(0);
  response.weekdayComparison.hasData = true;
  request.mockImplementation(async path => String(path).includes("/summary?") ? { days: [] } : response);
  await render();
  expect(weekdayChart().querySelectorAll("rect[data-series]")).toHaveLength(3);
  expect(container.querySelector(".analytics-average-revenue")).toBeNull();
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
  const target = weekdayPoint(0);
  const axisLabel = target.parentElement!.querySelector(".analytics-axis-label")!;
  expect(Number(target.getAttribute("y")) + Number(target.getAttribute("height"))).toBeGreaterThan(Number(axisLabel.getAttribute("y")) + 5);
  expect(table.open).toBe(false);
  expect(table.textContent).toContain("点击图中的星期");
  await clickPoint(weekdayPoint(0));
  expect(table.open).toBe(true);
  expect(table.querySelector("summary")!.textContent).toContain("星期一");
  expect([...table.querySelectorAll("tbody tr")].map(row => [...row.querySelectorAll("td")].map(cell => cell.textContent))).toEqual([
    ["2026-09-28", "$0.00", "$123.45", "$123.45"], ["2026-10-05", "$0.00", "$0.00", "$0.00"], ["2026-10-12", "—", "—", "—"],
  ]);
  expect(weekdayPoint(0).getAttribute("aria-pressed")).toBe("true");
  await act(async () => weekdayPoint(1).dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
  expect(table.querySelector("summary")!.textContent).toContain("星期一");
  table.open = false;
  await clickPoint(weekdayPoint(1));
  expect(table.open).toBe(true);
  expect(table.querySelector("summary")!.textContent).toContain("星期二");
  expect(table.querySelector("tbody")!.textContent).toBe("2026-10-06$0.00$990.00$990.00");
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
  expect([...weekdayChart().querySelectorAll("thead th")].map(th => th.textContent)).toEqual(["Date", "Highlighted", "Non-highlighted", "All"]);
  expect(weekdayChart().querySelector("tbody")!.textContent).toContain("$123.45");
  await act(async () => weekdayPoint(6).dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })));
  expect(weekdayChart().textContent).toContain("No dates for this weekday");
  await changeHighlight("ONLY_HIGHLIGHTED");
  expect(weekdayChart().querySelector("details")!.open).toBe(false);
  expect(weekdayChart().querySelector("tbody")).toBeNull();
  await clickPoint(weekdayPoint(0));
  expect(weekdayChart().querySelector("tbody")!.textContent).toContain("$123.45");
});

it("摘要在前，平均曲线与日历为主图，其余六图及全部明细按顺序保留，每日小计紧随热力图", async () => {
  await render();
  const chartGrid = container.querySelector(".analytics-heatmap")!.parentElement!;
  const report = container.querySelector(".finance-report-section")!;
  expect(chartGrid.nextElementSibling).toBe(report);
  expect(weekdayChart().querySelector(".analytics-scroll")).toBeNull();
  expect(weekdayChart().querySelector(".analytics-plot > svg")?.getAttribute("width")).toBe("100%");
  expect(weekdayChart().querySelectorAll(".analytics-axis-label")).toHaveLength(7);
  const hero = container.querySelector(".analytics-hero")!;
  expect(hero.previousElementSibling).toBe(container.querySelector(".analytics-overview"));
  expect([...hero.children].map(card => card.querySelector("h2")!.textContent)).toEqual(["平均营业额曲线", "每日营业额日历"]);
  expect(container.querySelectorAll(".analytics-average-revenue")).toHaveLength(1);
  expect([...chartGrid.children].map(card => card.querySelector("h2")!.textContent)).toEqual([
    "星期平均营业额", "流水与收入柱状图", "每日营业额趋势", "按小时上工数量", "每日记工数量", "星期 × 小时热力图",
  ]);
  expect(container.querySelectorAll(".analytics-card")).toHaveLength(8);
  expect(container.querySelector(".analytics-daily-revenue")).not.toBeNull();
  expect(container.querySelector(".hourly-details")).not.toBeNull();
  expect(container.querySelector(".analytics-heat-table")).not.toBeNull();
  expect([...report.querySelectorAll("button")].some(button => button.textContent === "显示全部列")).toBe(true);
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
  expect(container.querySelector(".analytics-income-bars tbody")!.textContent).toContain("总流水 $100.00 · 店铺收入 $50.00 · 总收入 $80.00");
  await act(async () => {
    const select = container.querySelector<HTMLSelectElement>(".analytics-income-bars select")!;
    select.value = "DAY"; select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(request).toHaveBeenCalledTimes(2);
  await changeHighlight("ONLY_HIGHLIGHTED");
  expect(container.querySelector(".analytics-income-bars tbody")!.textContent).toContain("总流水 $42.00 · 店铺收入 $21.00 · 总收入 $33.60");
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
  expect(chart.querySelector(".analytics-readout")!.textContent).toContain("全日期累计平均 $100.00 · 1 个已日结日");
  expect(chart.querySelector("tbody")!.textContent).toContain("最近7天平均 $100.00");
  expect(request.mock.calls.length).toBe(calls);
  await act(async () => choices.forEach(input => input.click()));
  expect(chart.querySelectorAll("path")).toHaveLength(0);
  expect(chart.textContent).toContain("请至少选择一条曲线");
  await changeHighlight("ONLY_HIGHLIGHTED");
  expect(container.querySelector<HTMLInputElement>('.analytics-average-revenue input[type="checkbox"]')!.checked).toBe(true);
});

it.each(["zh-CN", "en-US"])("平均曲线悬停、聚焦与点击同时显示当天营业额和均值，区分零与未日结：%s", async locale => {
  language.locale = locale;
  const en = locale === "en-US";
  request.mockImplementation(async path => {
    if (String(path).includes("/summary?")) return { days: [] };
    const response = stats();
    return { ...response, dateFrom: "2026-10-05", days: [
      { ...response.days[0]!, businessDate: "2026-10-05", revenueCents: "98765", average30Cents: "12345" },
      { ...response.days[0]!, businessDate: "2026-10-06", revenueCents: "0", average30Cents: "23456" },
      { ...response.days[0]!, businessDate: "2026-10-07", revenueCents: null, average30Cents: null },
    ] };
  });
  await render();
  const chart = container.querySelector(".analytics-average-revenue")!;
  const hits = [...chart.querySelectorAll<SVGElement>(".analytics-hit")];
  const readout = () => chart.querySelector(".analytics-readout")!.textContent;
  const calls = request.mock.calls.length;
  await act(async () => hits[0]!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true })));
  expect(readout()).toContain(en ? "Daily revenue $987.65" : "当天营业额 $987.65");
  expect(readout()).toContain(en ? "Trailing 30-day average $123.45" : "最近30天平均 $123.45");
  expect(chart.querySelector(".analytics-peak")!.textContent).toContain("$234.56");
  await act(async () => hits[1]!.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
  expect(readout()).toContain(en ? "Daily revenue $0.00" : "当天营业额 $0.00");
  await clickPoint(hits[2]!);
  expect(readout()).toContain(en ? "Daily revenue — (not closed)" : "当天营业额 —（未日结）");
  expect(readout()).toContain(en ? "Trailing 30-day average —" : "最近30天平均 —");
  expect(request.mock.calls.length).toBe(calls);
});

it("平均曲线纵轴跟随已勾选曲线最低和最高值，最高金额保留日期与所属曲线", async () => {
  request.mockImplementation(async path => {
    if (String(path).includes("/summary?")) return { days: [] };
    const response = stats();
    return { ...response, dateFrom: "2026-10-05", days: [
      { ...response.days[0]!, businessDate: "2026-10-05", average30Cents: "12345", averageCents: "10001", cumulativeAverageCents: "30002" },
      { ...response.days[0]!, businessDate: "2026-10-06", average30Cents: null, averageCents: null, cumulativeAverageCents: null },
      { ...response.days[0]!, businessDate: "2026-10-07", average30Cents: "23456", averageCents: "40003", cumulativeAverageCents: "35004" },
    ] };
  });
  await render();
  const chart = container.querySelector(".analytics-average-revenue")!;
  const axis = () => [...chart.querySelectorAll(".analytics-y-label")].map(node => node.textContent);
  const choices = [...chart.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  expect(axis()[0]).toBe("$123.45");
  expect(axis().at(-1)).toBe("$234.56");
  expect(chart.querySelector(".analytics-peak")!.textContent).toContain("2026-10-07 · 最近30天平均");
  const calls = request.mock.calls.length;
  await act(async () => { choices[1]!.click(); choices[2]!.click(); });
  expect(axis()[0]).toBe("$100.01");
  expect(axis().at(-1)).toBe("$400.03");
  expect(chart.querySelector(".analytics-peak")!.textContent).toContain("$400.03 · 2026-10-07 · 最近7天平均");
  expect(chart.querySelector(".analytics-peak-point")!.getAttribute("data-series")).toBe("7");
  await act(async () => { choices[1]!.click(); choices[2]!.click(); });
  expect(axis()[0]).toBe("$123.45");
  expect(axis().at(-1)).toBe("$234.56");
  expect(request.mock.calls.length).toBe(calls);
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
  for (const plot of container.querySelectorAll(".analytics-card:not(.analytics-weekday-revenue) .analytics-plot")) {
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
  for (const svg of container.querySelectorAll(".analytics-card:not(.analytics-weekday-revenue) .analytics-plot > svg")) {
    expect(svg.getAttribute("viewBox")).toBe("0 0 280 270");
    expect(svg.getAttribute("height")).toBe("270");
  }
  const svg = container.querySelector(".analytics-average-revenue .analytics-plot > svg")!;
  expect(svg.textContent).toContain("10-06");
  expect(svg.textContent).toContain("10-07");
  await changeHighlight("ONLY_HIGHLIGHTED");
  expect(disconnect).toHaveBeenCalledTimes(5);
});
