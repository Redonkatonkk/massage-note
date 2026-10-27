// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api";
import type { FinanceSummaryResponse } from "../../lib/types";
import type { FinanceAnalyticsResponse } from "@massage-note/contracts";
import { shiftDate } from "./date-utils";
import { MonthlySummaryDashboard } from "./monthly-summary-dashboard";

vi.mock("../../lib/api", () => ({ apiBase: "/api/v1", apiRequest: vi.fn(), errorMessage: (error: Error) => error.message }));
const language = vi.hoisted(() => ({ locale: "en-US" }));
vi.mock("../language-provider", () => ({ useLanguage: () => language }));
const request = vi.mocked(apiRequest);
let root: Root;
let container: HTMLDivElement;

function summary(month = "2026-10", end = "22", turnover = 12501): FinanceSummaryResponse {
  const base = { itemCount: 2, recordCount: 2, incompleteRecordCount: 1, giftCardSaleCount: 0,
    mainServiceAmountCents: 10000, addonTotalCents: 0, grossFeeBaseCents: 10000, discountTotalCents: 0,
    discountedFeePerformanceCents: 10000, actualServiceCollectedCents: 10000, cashServiceCents: 4000,
    cardServiceCents: 5000, giftCardServiceCents: 1000, cashTipCents: 2012, cardTipCents: 0, giftCardTipCents: 0,
    totalTipCents: 2012, customerTotalPaidCents: 12012, giftCardSaleCashCents: 0, giftCardSaleCardCents: 0,
    giftCardSalesAmountCents: 0, giftCardRedemptionCents: 1000, storeIncomeCents: -1234,
    totalLargeFeeWageCents: 7000, employeeIncomeCents: 9012, cashAcquiredServiceWageCents: 0 };
  return {
    filters: { dateFrom: `${month}-01`, dateTo: `${month}-${end}`, membershipIds: [], paymentMethod: "ALL", amountType: "ALL", highlightFilter: "ALL" },
    totals: { ...base, totalTurnoverCents: turnover, totalIncomeCents: -1234, averageRevenueCents: null,
      averageRevenueDayCount: 0, ownerWorkerIncomeCents: 0, managerWorkerIncomeCents: 0, giftCardNetIncomeCents: 0,
      creditCardFeeCents: 0, payrollPaidWithinRangeCents: 0, settledCashAcquiredWithinRangeCents: 0, employerOwesCents: 0, overpaidCents: 0 },
    days: [{ ...base, businessDate: `${month}-02`, dailyTurnoverCents: turnover, recentClosedRevenue: null, totalIncomeCents: -1234 }],
    employees: [{ ...base, membershipId: "employee", displayName: "Long employee name / 员工", role: "EMPLOYEE", defaultCommissionBps: 6000, hasDifferentItemCommission: false }],
    balances: [],
  };
}
const onMonthChange = vi.fn(), onViewDetails = vi.fn(), onRetry = vi.fn(), onQuery = vi.fn();
async function render(data: FinanceSummaryResponse | null = summary(), month = "2026-10", failed = false, canViewStoreTrend = true, highlightFilter: FinanceSummaryResponse["filters"]["highlightFilter"] = "ALL") {
  await act(async () => root.render(<MonthlySummaryDashboard storeId="store" today="2026-10-22" month={month} highlightFilter={highlightFilter} summary={data} loading={!data && !failed} failed={failed} busy={false} canViewStoreTrend={canViewStoreTrend} onMonthChange={onMonthChange} onViewDetails={onViewDetails} onRetry={onRetry} onQuery={onQuery}><section data-subtotal>Employee subtotal</section></MonthlySummaryDashboard>));
}
const click = async (element: Element) => act(async () => { element.dispatchEvent(new MouseEvent("click", { bubbles: true })); });

function reply(path: string) {
  const url = new URL(path, "http://local"), from = url.searchParams.get("dateFrom")!, to = url.searchParams.get("dateTo")!;
  if (url.pathname.endsWith("/summary")) return summary(from.slice(0, 7), to.slice(8), from.startsWith("2026-09") ? 10000 : 8000);
  const days: FinanceAnalyticsResponse["days"] = [];
  for (let date = from; date <= to; date = shiftDate(date, 1)) {
    const average30Cents = date.endsWith("03") ? null : date.endsWith("04") ? "0" : date.startsWith("2026-10") ? "3456" : "1234";
    days.push({ businessDate: date, hours: [], count: 1, lostCustomerCount: 0, revenueCents: average30Cents === null ? null : "90000", averageCents: "111", averageDayCount: 1, average30Cents, average30DayCount: average30Cents === null ? 0 : 3, cumulativeAverageCents: "222", cumulativeAverageDayCount: 1 });
  }
  return { dateFrom: from, dateTo: to, hasData: true, trends: null, days, hours: [], weekdays: [], weekdayComparison: { hasData: false, days: [], weekdays: [] } } satisfies FinanceAnalyticsResponse;
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  language.locale = "en-US";
  request.mockReset();
  request.mockImplementation(async path => reply(String(path)));
  vi.clearAllMocks();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it("loads the previous matching dates, preserves cents and negative amounts, and keeps subtotals last", async () => {
  await render();
  expect(request).toHaveBeenCalledTimes(3);
  const query = new URL(String(request.mock.calls[0]![0]), "http://local").searchParams;
  expect(query.get("dateFrom")).toBe("2026-09-01");
  expect(query.get("dateTo")).toBe("2026-09-22");
  expect(query.get("highlightFilter")).toBe("ALL");
  const metrics = container.querySelector(".monthly-finance__metrics")!;
  expect(metrics.textContent).toContain("$125.01");
  expect(metrics.textContent).toContain("-$12.34");
  expect(metrics.textContent).toContain("+25.0%");
  expect(container.querySelector(".monthly-finance")!.lastElementChild?.hasAttribute("data-subtotal")).toBe(true);
  expect(container.textContent).toContain("1 services await payment");
  expect(container.querySelector(".monthly-finance__comparison tbody")!.textContent).toContain("—");
  const exported = new URL(container.querySelector<HTMLAnchorElement>(".export-link")!.href);
  expect(exported.searchParams.get("dateFrom")).toBe("2026-10-01");
  expect(exported.searchParams.get("dateTo")).toBe("2026-10-22");
  await click(metrics.querySelector("button")!);
  expect(onViewDetails).toHaveBeenCalledWith("Monthly turnover");
  expect([...metrics.querySelectorAll("button > span")].map(node => node.textContent)).toEqual(["Monthly turnover", "Monthly store income", "Monthly total income", "Service records"]);
  expect(container.querySelector(".monthly-finance__employees")).toBeNull();
  const table = container.querySelector(".monthly-finance__comparison")!;
  expect([...table.querySelectorAll("thead th")].slice(1, 4).map(node => node.textContent?.slice(0, 7))).toEqual(["2026-10", "2026-09", "2026-08"]);
  expect([...table.querySelectorAll("tbody tr:first-child td")].slice(0, 3).map(node => node.textContent)).toEqual(["$125.01", "$100.00", "$80.00"]);
});

it("changes months and reads exact server 30-day averages instead of daily turnover", async () => {
  await render();
  expect(container.querySelector<HTMLButtonElement>('[aria-label="Next month"]')!.disabled).toBe(true);
  await click(container.querySelector('[aria-label="Previous month"]')!);
  expect(onMonthChange).toHaveBeenCalledWith("2026-09");
  const analyticsPath = request.mock.calls.find(([path]) => String(path).includes("/analytics?"))![0];
  const query = new URL(String(analyticsPath), "http://local").searchParams;
  expect(Object.fromEntries(query)).toEqual({ dateFrom: "2026-09-01", dateTo: "2026-10-22", highlightFilter: "ALL" });
  expect(container.querySelector(".monthly-finance__toggle")).toBeNull();
  const point = container.querySelectorAll(".analytics-hit")[1]!;
  expect(point.getAttribute("aria-label")).toContain("2026-10: $34.56 · 3 closed days");
  expect(point.getAttribute("aria-label")).toContain("2026-09: $12.34");
  expect(container.querySelectorAll(".analytics-hit")[2]!.getAttribute("aria-label")).toContain("not closed");
  expect(container.querySelectorAll(".analytics-hit")[3]!.getAttribute("aria-label")).toContain("$0.00");
  await act(async () => point.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
  expect(container.querySelector(".analytics-readout")!.textContent).toContain("$34.56");
});

it("does not show a stale month's amounts, export or employee subtotal while switching", async () => {
  const data = summary();
  await render(data);
  await render(data, "2026-08");
  expect(container.querySelector(".monthly-finance__metrics")!.textContent).not.toContain("$125.01");
  expect(container.querySelector("[data-subtotal]")).toBeNull();
  expect(container.querySelector(".export-link")).toBeNull();
  expect(container.textContent).toContain("Loading monthly finances");
});

it("places both selected highlight options below the toolbar and applies them only on Search", async () => {
  await render();
  const form = container.querySelector<HTMLFormElement>(".monthly-finance__filters")!;
  expect(container.querySelector(".monthly-finance__toolbar")!.nextElementSibling).toBe(form);
  const [nonHighlighted, highlighted] = [...form.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
  expect([...form.querySelectorAll("label")].map(label => label.textContent)).toEqual(["Non-highlighted", "Highlighted"]);
  expect([nonHighlighted!.checked, highlighted!.checked]).toEqual([true, true]);
  request.mockClear();
  await click(highlighted!);
  expect(request).not.toHaveBeenCalled();
  expect(onQuery).not.toHaveBeenCalled();
  await click(form.querySelector("button")!);
  expect(onQuery).toHaveBeenLastCalledWith("EXCLUDE_HIGHLIGHTED");
  await click(nonHighlighted!);
  expect(form.querySelector("button")!.disabled).toBe(true);
  expect(form.querySelector('[role="status"]')!.textContent).toBe("Select at least one option.");
  await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(onQuery).toHaveBeenCalledTimes(1);
  await click(highlighted!);
  await click(form.querySelector("button")!);
  expect(onQuery).toHaveBeenLastCalledWith("ONLY_HIGHLIGHTED");
  await click(nonHighlighted!);
  await click(form.querySelector("button")!);
  expect(onQuery).toHaveBeenLastCalledWith("ALL");
});

it("hides amounts, export and subtotals from a different applied highlight filter", async () => {
  const data = summary();
  await render(data);
  request.mockClear();
  await render(data, "2026-10", false, true, "ONLY_HIGHLIGHTED");
  expect(container.querySelector(".monthly-finance__metrics")!.textContent).not.toContain("$125.01");
  expect(container.querySelector("[data-subtotal]")).toBeNull();
  expect(container.querySelector(".export-link")).toBeNull();
  expect(request).not.toHaveBeenCalled();
});

it("keeps comparison errors distinct from zero and supports retry", async () => {
  request.mockRejectedValueOnce(new Error("Offline"));
  await render();
  expect(container.textContent).toContain("Monthly comparison is unavailable: Offline");
  expect(container.querySelector(".monthly-finance__metrics")!.textContent).not.toContain("+25.0%");
  await click([...container.querySelectorAll("button")].find(button => button.textContent === "Retry comparison")!);
  expect(container.querySelector(".monthly-finance__metrics")!.textContent).toContain("+25.0%");
  await render(null, "2026-10", true);
  expect(container.querySelector(".monthly-finance__metrics")!.textContent).not.toContain("$0.00");
  await click([...container.querySelectorAll("button")].find(button => button.textContent === "Retry")!);
  expect(onRetry).toHaveBeenCalledOnce();
});

it("ignores an earlier comparison that resolves after a different month is selected", async () => {
  let resolveOld!: (value: FinanceSummaryResponse) => void;
  request.mockImplementationOnce(() => new Promise(resolve => { resolveOld = resolve as typeof resolveOld; }));
  await render();
  request.mockResolvedValueOnce(summary("2026-07", "31", 20000));
  await render(summary("2026-08", "31", 40000), "2026-08");
  await act(async () => resolveOld(summary("2026-09", "22", 100)));
  expect(container.querySelector(".monthly-finance__metrics")!.textContent).toContain("+100.0%");
  expect(container.querySelector(".monthly-finance__metrics")!.textContent).not.toContain("+39,900");
});

it("renders Chinese labels and real empty-month zeros", async () => {
  language.locale = "zh-CN";
  const empty = summary(); empty.employees = []; empty.days = [];
  for (const key of Object.keys(empty.totals)) (empty.totals as unknown as Record<string, number | null>)[key] = key === "averageRevenueCents" ? null : 0;
  await render(empty);
  expect(container.textContent).toContain("月度汇总");
  expect(container.querySelector(".monthly-finance__metrics")!.textContent).toContain("$0.00");
  expect(container.querySelector("[data-subtotal]")).not.toBeNull();
  expect(container.querySelector('[aria-label="选择月份"]')).not.toBeNull();
  expect(container.querySelector(".monthly-finance__payment-list")!.textContent).not.toContain("NaN");
});

it("does not request store-wide analytics for employees", async () => {
  await render(summary(), "2026-10", false, false);
  expect(request.mock.calls.some(([path]) => String(path).includes("/analytics?"))).toBe(false);
  expect(container.textContent).toContain("available to managers only");
});

it("keeps an earlier-month failure separate and retries only that request", async () => {
  request.mockImplementation(async path => {
    if (String(path).includes("/summary?") && String(path).includes("dateFrom=2026-08")) throw new Error("Earlier offline");
    return reply(String(path));
  });
  await render();
  expect(container.textContent).toContain("2026-08 · Monthly comparison is unavailable: Earlier offline");
  const cells = container.querySelectorAll(".monthly-finance__comparison tbody tr:first-child td");
  expect(cells[1]!.textContent).toBe("$100.00");
  expect(cells[2]!.textContent).toBe("—");
  request.mockImplementation(async path => reply(String(path)));
  const count = request.mock.calls.length;
  await click([...container.querySelectorAll("button")].find(button => button.textContent === "Retry comparison")!);
  expect(request).toHaveBeenCalledTimes(count + 1);
  expect(container.querySelectorAll(".monthly-finance__comparison tbody tr:first-child td")[2]!.textContent).toBe("$80.00");
});

it("keeps average failures separate from financial totals and retries only averages", async () => {
  request.mockImplementation(async path => {
    if (String(path).includes("/analytics?")) throw new Error("Average offline");
    return reply(String(path));
  });
  await render();
  expect(container.querySelector(".monthly-finance__metrics")!.textContent).toContain("$125.01");
  expect(container.querySelector(".monthly-finance__trend")!.textContent).toContain("Average revenue is unavailable: Average offline");
  expect(container.querySelector(".analytics-hit")).toBeNull();
  request.mockImplementation(async path => reply(String(path)));
  const count = request.mock.calls.length;
  await click([...container.querySelectorAll("button")].find(button => button.textContent === "Retry averages")!);
  expect(request).toHaveBeenCalledTimes(count + 1);
  expect(container.querySelectorAll(".analytics-hit")[1]!.getAttribute("aria-label")).toContain("$34.56");
});
