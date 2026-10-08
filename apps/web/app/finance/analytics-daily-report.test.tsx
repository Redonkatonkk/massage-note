// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { FinanceAnalyticsResponse } from "@massage-note/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api";
import type { FinanceDetailsResponse, FinanceSummaryResponse } from "../../lib/types";
import { AnalyticsDailyReport } from "./analytics-daily-report";

vi.mock("../../lib/api", () => ({ apiRequest: vi.fn(), errorMessage: (error: Error) => error.message }));
const state = vi.hoisted(() => ({ locale: "zh-CN", refresh: async () => {} }));
vi.mock("../language-provider", () => ({ useLanguage: () => state }));
vi.mock("../../lib/realtime", () => ({ useStoreRealtime: (_store: string, refresh: () => Promise<void>) => { state.refresh = refresh; } }));
const request = vi.mocked(apiRequest);
let root: Root;
let container: HTMLDivElement;
let data: FinanceAnalyticsResponse;

function summary(cents = 12000): Pick<FinanceSummaryResponse, "days"> {
  return { days: [{ businessDate: "2026-10-05", dailyTurnoverCents: cents, recentClosedRevenue: { averageCents: 7500, dayCount: 3 },
    mainServiceAmountCents: cents, addonTotalCents: 0, grossFeeBaseCents: cents, discountTotalCents: 0, discountedFeePerformanceCents: cents,
    giftCardSalesAmountCents: 0, giftCardRedemptionCents: 0, employeeIncomeCents: 6000, storeIncomeCents: 6000, totalIncomeCents: 6000,
  } as FinanceSummaryResponse["days"][number]] };
}
const details = { filters: { dateFrom: "2026-10-05", dateTo: "2026-10-05", paymentMethod: "ALL" }, records: [], giftCardSales: [] } as unknown as FinanceDetailsResponse;
async function render(highlightFilter: "ALL" | "ONLY_HIGHLIGHTED" | "EXCLUDE_HIGHLIGHTED" = "ALL", storeId = "store") {
  await act(async () => root.render(<AnalyticsDailyReport storeId={storeId} data={data} highlightFilter={highlightFilter} />));
}
function query(path: string) { return new URL(String(request.mock.calls.filter(([url]) => String(url).includes(`/${path}?`)).at(-1)![0]), "http://localhost").searchParams; }
function calendarDay(date: string) { return container.querySelector<HTMLTimeElement>(`.analytics-revenue-calendar time[datetime="${date}"]`)!.closest("button")!; }
async function click(button: HTMLButtonElement) { await act(async () => button.click()); }
function button(label: string) { return [...container.querySelectorAll("button")].find(item => item.textContent === label)!; }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  state.locale = "zh-CN";
  data = { dateFrom: "2026-10-05", dateTo: "2026-10-07", hasData: true, hours: [], weekdays: [],
    days: ["2026-10-05", "2026-10-06", "2026-10-07"].map((businessDate, index) => ({ businessDate, revenueCents: ["134567", "0", null][index]!, count: 0, hours: [], lostCustomerCount: 0, averageCents: null, averageDayCount: 0 })),
  };
  request.mockReset(); request.mockImplementation(async url => String(url).includes("/summary?") ? summary() : details);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it("日历金额在日期下，区分已日结零值、未日结与范围外，保留星期、流水和全店参考平均", async () => {
  await render();
  expect(calendarDay("2026-10-05").querySelector("small")!.textContent).toBe("1345.67");
  expect(calendarDay("2026-10-05").getAttribute("aria-label")).toContain("1,345.67");
  expect(calendarDay("2026-10-06").querySelector("small")!.textContent).toBe("0");
  expect(calendarDay("2026-10-07").querySelector("small")!.textContent).toBe("—");
  expect(calendarDay("2026-10-04").disabled).toBe(true);
  expect(calendarDay("2026-10-04").querySelector("small")).toBeNull();
  expect(calendarDay("2026-10-08").disabled).toBe(true);
  const cells = [...container.querySelectorAll(".finance-daily-table tbody td")].map(cell => cell.textContent);
  expect(cells.slice(0, 4)).toEqual(["2026-10-05", "星期一", "US$120", "US$75"]);
  expect(container.textContent).toContain("全店参考");
  await click(button("显示全部列"));
  expect(container.querySelector(".finance-daily-table")!.classList.contains("is-expanded")).toBe(true);
});

it("三种高光筛选作用于小计与日历点击明细，不继承财务的员工或付款条件", async () => {
  for (const filter of ["ALL", "ONLY_HIGHLIGHTED", "EXCLUDE_HIGHLIGHTED"] as const) {
    await render(filter);
    expect(query("summary").get("highlightFilter")).toBe(filter);
    expect(query("summary").get("dateFrom")).toBe("2026-10-05");
    expect(query("summary").get("dateTo")).toBe("2026-10-07");
    expect(query("summary").get("paymentMethod")).toBe("ALL");
    expect(query("summary").has("membershipIds")).toBe(false);
    await click(calendarDay("2026-10-05"));
    expect(query("details").get("highlightFilter")).toBe(filter);
    expect(query("details").get("dateFrom")).toBe("2026-10-05");
    expect(query("details").get("dateTo")).toBe("2026-10-05");
    expect(container.querySelector("[role=dialog]")!.textContent).toContain("营业额");
    await click(button("关闭"));
  }
  await click(container.querySelector<HTMLButtonElement>(".finance-daily-table .amount-link")!);
  expect(container.querySelector("[role=dialog]")!.textContent).toContain("今日流水");
  expect(query("details").get("highlightFilter")).toBe("EXCLUDE_HIGHLIGHTED");
});

it("跨月切换只浏览当前范围，不请求未筛选的今日页日历接口", async () => {
  data = { ...data, dateFrom: "2026-09-29" };
  await render();
  const previous = container.querySelector<HTMLButtonElement>('button[aria-label="上个月"]')!;
  const next = container.querySelector<HTMLButtonElement>('button[aria-label="下个月"]')!;
  expect(next.disabled).toBe(true);
  await click(previous);
  expect(container.querySelector(".business-date-picker__popover header strong")!.textContent).toBe("2026年9月");
  expect(previous.disabled).toBe(true);
  expect(calendarDay("2026-09-28").disabled).toBe(true);
  expect(calendarDay("2026-09-29").disabled).toBe(false);
  await click(next);
  expect(request).toHaveBeenCalledTimes(1);
  expect(String(request.mock.calls[0]![0])).toContain("/finance/summary?");
});

it("切换条件或店铺后不展示旧小计或旧日期明细，延迟响应不能回写", async () => {
  let resolveSummary!: (value: ReturnType<typeof summary>) => void;
  let resolveDetails!: (value: FinanceDetailsResponse) => void;
  request.mockImplementationOnce(() => new Promise(resolve => { resolveSummary = resolve; }));
  await render("ONLY_HIGHLIGHTED");
  request.mockImplementationOnce(() => new Promise(resolve => { resolveDetails = resolve; }));
  await click(calendarDay("2026-10-05"));
  request.mockImplementation(async url => String(url).includes("/summary?") ? summary(25000) : details);
  await render("EXCLUDE_HIGHLIGHTED", "other-store");
  expect(container.querySelector("[role=dialog]")).toBeNull();
  expect(container.querySelector(".finance-daily-table")!.textContent).toContain("US$250");
  await act(async () => { resolveSummary(summary(99900)); resolveDetails(details); });
  expect(container.querySelector(".finance-daily-table")!.textContent).not.toContain("US$999");
  expect(container.querySelector("[role=dialog]")).toBeNull();
});

it("小计失败可单独重试，空结果仍显示日历和空提示", async () => {
  request.mockRejectedValueOnce(new Error("小计读取失败"));
  await render("EXCLUDE_HIGHLIGHTED");
  expect(container.querySelector("[role=alert]")!.textContent).toContain("小计读取失败");
  expect(container.querySelector(".analytics-revenue-calendar")).not.toBeNull();
  request.mockResolvedValueOnce({ days: [] });
  await click(button("重试"));
  expect(query("summary").get("highlightFilter")).toBe("EXCLUDE_HIGHLIGHTED");
  expect(container.textContent).toContain("当前筛选没有每日小计。");
});

it("明细失败保留重试入口，重复点击受保护，实时刷新当前小计与打开的明细", async () => {
  await render("ONLY_HIGHLIGHTED");
  let reject!: (error: Error) => void;
  request.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  await click(calendarDay("2026-10-05"));
  expect(calendarDay("2026-10-05").disabled).toBe(true);
  expect(container.querySelector<HTMLButtonElement>(".amount-link")!.disabled).toBe(true);
  await act(async () => reject(new Error("明细读取失败")));
  expect(container.querySelector("[role=alert]")!.textContent).toContain("明细读取失败");
  await click(button("重试"));
  expect(container.querySelector("[role=dialog]")).not.toBeNull();
  request.mockClear();
  await act(async () => state.refresh());
  expect(request).toHaveBeenCalledTimes(2);
  expect(query("summary").get("highlightFilter")).toBe("ONLY_HIGHLIGHTED");
  expect(query("details").get("highlightFilter")).toBe("ONLY_HIGHLIGHTED");
});

it("英文日历、星期和每日小计保持相同语义", async () => {
  state.locale = "en-US"; await render();
  expect(container.textContent).toContain("Daily revenue calendar");
  expect(container.textContent).toContain("Daily subtotals");
  expect(container.querySelector(".finance-daily-table tbody td:nth-child(2)")!.textContent).toBe("Monday");
  expect(calendarDay("2026-10-07").getAttribute("aria-label")).toContain("Not closed");
});
