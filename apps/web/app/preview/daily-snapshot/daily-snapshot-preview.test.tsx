// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DailySnapshotPreview } from "./daily-snapshot-preview";
import { dailySnapshotFixtures, getPreviewMonthToDate } from "./fixtures";

const preferences = vi.hoisted(() => ({ locale: "zh-CN" }));
vi.mock("../../language-provider", () => ({ useLanguage: () => preferences }));

let root: Root, host: HTMLDivElement;
const fetch = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  preferences.locale = "zh-CN";
  fetch.mockReset();
  vi.stubGlobal("fetch", fetch);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

async function render() { await act(async () => root.render(<DailySnapshotPreview />)); }
function selectedDate() { return host.querySelector<HTMLTimeElement>(".daily-snapshot-selected-date")!.dateTime; }
function earnings() { return host.querySelector(".daily-snapshot-income strong")!.textContent; }
function cards() { return host.querySelectorAll(".daily-snapshot-record"); }
function button(label: string) { return host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!; }
function calendarDay(day: number) {
  return [...host.querySelectorAll<HTMLButtonElement>(".business-date-picker__days button")]
    .find(node => node.querySelector("span")!.textContent === String(day))!;
}
async function chooseDate(date: string) {
  await act(async () => calendarDay(Number(date.slice(-2))).click());
}

it("opens the sample daily card, switches the entire day and respects date boundaries without API requests", async () => {
  await render();
  expect(host.textContent).toContain("设计预览 · 示例数据");
  expect(host.querySelector("h1")!.textContent).toContain("Lily");
  expect(selectedDate()).toBe("2026-11-15");
  expect(host.querySelector('input[type="date"]')).toBeNull();
  const calendar = host.querySelector(".daily-snapshot-calendar .business-date-picker__popover");
  expect(calendar).not.toBeNull();
  expect(calendarDay(15).getAttribute("aria-pressed")).toBe("true");
  expect(earnings()).toBe("$265.00");
  expect(cards()).toHaveLength(4);

  await act(async () => button("前一天").click());
  expect(selectedDate()).toBe("2026-11-14");
  expect(earnings()).toBe("$95.00");
  expect(cards()).toHaveLength(1);
  expect(host.textContent).not.toContain("Hot stone");
  await act(async () => button("后一天").click());
  expect(selectedDate()).toBe("2026-11-15");
  expect(earnings()).toBe("$265.00");
  expect(cards()).toHaveLength(4);

  await chooseDate("2026-11-12");
  expect(button("前一天").disabled).toBe(true);
  await act(async () => button("前一天").click());
  expect(selectedDate()).toBe("2026-11-12");
  await chooseDate("2026-11-16");
  expect(button("后一天").disabled).toBe(true);
  await act(async () => button("后一天").click());
  expect(selectedDate()).toBe("2026-11-16");
  expect(earnings()).toBe("$124.00");
  expect(cards()).toHaveLength(3);
  expect(host.querySelector(".daily-snapshot-calendar .business-date-picker__popover")).toBe(calendar);
  expect(calendarDay(16).getAttribute("aria-pressed")).toBe("true");
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps a genuine empty day and zero tips distinct from unconfirmed pending earnings", async () => {
  await render();
  await chooseDate("2026-11-12");
  expect(earnings()).toBe("$0.00");
  expect([...host.querySelectorAll(".daily-snapshot-breakdown dd")].map(node => node.textContent)).toEqual(["$0.00", "$0.00"]);
  expect(host.textContent).toContain("0 笔已确认");
  expect(host.textContent).toContain("这一天没有记工。");
  expect(cards()).toHaveLength(0);

  await chooseDate("2026-11-13");
  expect(earnings()).toBe("$42.00");
  expect(host.querySelectorAll(".daily-snapshot-breakdown dd")[1]!.textContent).toBe("$0.00");
  expect(cards()).toHaveLength(1);
  expect(host.textContent).not.toContain("未确认");

  await chooseDate("2026-11-16");
  expect(earnings()).toBe("$124.00");
  expect(host.textContent).toContain("2 笔已确认");
  expect(host.textContent).toContain("1 笔待结账");
  const pending = host.querySelector(".daily-snapshot-record.is-pending")!;
  expect(pending.querySelector(".daily-snapshot-record-income strong")!.textContent).toBe("未确认");
  expect(pending.textContent).toContain("待结账 · 未计入汇总");
  expect(fetch).not.toHaveBeenCalled();
});

it("preserves the selected date when the language changes and translates the card and date controls", async () => {
  await render();
  await chooseDate("2026-11-16");
  preferences.locale = "en-US";
  await render();
  expect(selectedDate()).toBe("2026-11-16");
  expect(earnings()).toBe("$124.00");
  expect(host.textContent).toContain("Design preview · sample data");
  expect(host.querySelector("h1")!.textContent).toContain("Daily work card");
  expect(host.textContent).toContain("Confirmed earnings");
  expect(host.textContent).toContain("2 confirmed");
  expect(host.textContent).toContain("1 pending");
  expect(host.textContent).toContain("Pending checkout · excluded from totals");
  expect(host.querySelector(".daily-snapshot-record.is-pending .daily-snapshot-record-income strong")!.textContent).toBe("Unconfirmed");
  expect(button("Next day").disabled).toBe(true);
  expect(button("Previous day").disabled).toBe(false);
  expect(calendarDay(16).getAttribute("aria-label")).toContain("November 16, 2026");
  expect(calendarDay(16).getAttribute("aria-pressed")).toBe("true");
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps out-of-range calendar days and months disabled without changing the chosen day", async () => {
  await render();
  expect(calendarDay(11).disabled).toBe(true);
  expect(calendarDay(17).disabled).toBe(true);
  expect(button("上个月").disabled).toBe(true);
  expect(button("下个月").disabled).toBe(true);
  await act(async () => { calendarDay(11).click(); calendarDay(17).click(); });
  expect(selectedDate()).toBe("2026-11-15");
  expect(earnings()).toBe("$265.00");
  expect(cards()).toHaveLength(4);
  await chooseDate("2026-11-14");
  expect(selectedDate()).toBe("2026-11-14");
  expect(earnings()).toBe("$95.00");
  expect(calendarDay(14).getAttribute("aria-pressed")).toBe("true");
  expect(calendarDay(15).getAttribute("aria-pressed")).toBe("false");
  expect(fetch).not.toHaveBeenCalled();
});

it("shows source totals and distinguishes card payments from cash with the amount frame", async () => {
  await render();
  const sources = host.querySelector("section.daily-snapshot-sources")!;
  expect(sources).not.toBeNull();
  expect(host.querySelector("details.daily-snapshot-sources")).toBeNull();
  const sourceRows = [...sources.querySelectorAll("tbody tr")].map(row => [...row.querySelectorAll("td")].map(cell => cell.textContent));
  expect(sourceRows).toEqual([["$66.00", "$25.00", "$91.00", "$133.00"], ["$111.00", "$63.00", "$174.00", "$269.00"]]);
  expect([...sources.querySelectorAll("tfoot td")].map(cell => cell.textContent)).toEqual(["$177.00", "$88.00", "$265.00", "$402.00"]);
  expect([...sources.querySelectorAll("thead th")].map(cell => cell.textContent)).toEqual(["来源", "今日大费工资", "今日小费", "今日总额", "本月至今合计"]);
  const paymentTexts = (method: string, selector: string) => [...host.querySelectorAll(`.daily-snapshot-payment--${method} ${selector}`)].map(node => node.textContent);
  expect(paymentTexts("cash", '[aria-hidden="true"]')).toEqual(["$70.00", "$25.00", "$40.00"]);
  expect(paymentTexts("card", '[aria-hidden="true"]')).toEqual(["$100.00", "$35.00", "$30.00", "$10.00"]);
  expect(paymentTexts("cash", ".daily-snapshot-sr-only")[0]).toBe("现金 $70.00");
  expect(paymentTexts("card", ".daily-snapshot-sr-only")[0]).toBe("刷卡 $100.00");
  expect(host.querySelector(".daily-snapshot-payment--gift")!.textContent).toContain("礼物卡");

  preferences.locale = "en-US";
  await render();
  expect([...sources.querySelectorAll("thead th")].map(cell => cell.textContent)).toEqual(["Source", "Today's service wages", "Today's tips", "Today's total", "Month-to-date total"]);
  expect(paymentTexts("cash", '[aria-hidden="true"]')[0]).toBe("$70.00");
  expect(paymentTexts("card", '[aria-hidden="true"]')[0]).toBe("$100.00");
  expect(paymentTexts("cash", ".daily-snapshot-sr-only")[0]).toBe("Cash $70.00");
  expect(paymentTexts("card", ".daily-snapshot-sr-only")[0]).toBe("Card $100.00");
  expect(host.querySelector(".daily-snapshot-payment--gift")!.textContent).toContain("Gift card");
  await chooseDate("2026-11-13");
  expect(host.querySelector(".daily-snapshot-payment--zero")!.textContent).toBe("$0.00");
  await chooseDate("2026-11-16");
  expect(host.querySelector(".daily-snapshot-payment--unknown")!.textContent).toBe("Unconfirmed");
  expect(fetch).not.toHaveBeenCalled();
});

it("updates source month-to-date totals and their date range through the selected day only", async () => {
  await render();
  const sources = () => host.querySelector("section.daily-snapshot-sources")!;
  const sourceTotals = () => [...sources().querySelectorAll("tbody tr")].map(row => row.querySelector("td:last-child")!.textContent);
  const grandTotal = () => sources().querySelector("tfoot td:last-child")!.textContent;
  function expectRange(dateTo: string) {
    expect(sources().textContent).toContain("2026-11-01");
    expect(sources().textContent).toContain(dateTo);
  }

  expect(sourceTotals()).toEqual(["$133.00", "$269.00"]);
  expect(grandTotal()).toBe("$402.00");
  expectRange("2026-11-15");
  await chooseDate("2026-11-14");
  expect(sourceTotals()).toEqual(["$42.00", "$95.00"]);
  expect(grandTotal()).toBe("$137.00");
  expectRange("2026-11-14");
  await chooseDate("2026-11-16");
  expect(sourceTotals()).toEqual(["$195.00", "$331.00"]);
  expect(grandTotal()).toBe("$526.00");
  expectRange("2026-11-16");
  await chooseDate("2026-11-12");
  expect(sourceTotals()).toEqual(["$0.00", "$0.00"]);
  expect(grandTotal()).toBe("$0.00");
  expectRange("2026-11-12");
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps preview month-to-date totals inside their month and excludes later days", () => {
  expect(getPreviewMonthToDate("2026-11-14")).toEqual({
    dateFrom: "2026-11-01", dateTo: "2026-11-14", cashIncomeCents: 4200, nonCashIncomeCents: 9500, totalIncomeCents: 13700,
  });
  expect(getPreviewMonthToDate("2026-10-31")).toEqual({
    dateFrom: "2026-10-01", dateTo: "2026-10-31", cashIncomeCents: 0, nonCashIncomeCents: 0, totalIncomeCents: 0,
  });
  expect(getPreviewMonthToDate("2026-12-01")).toEqual({
    dateFrom: "2026-12-01", dateTo: "2026-12-01", cashIncomeCents: 0, nonCashIncomeCents: 0, totalIncomeCents: 0,
  });
});

it("uses synthetic totals that reconcile with their displayed earnings sources and confirmed records", () => {
  for (const snapshot of dailySnapshotFixtures) {
    const employee = snapshot.employee;
    expect(employee.confirmedLargeFeeWageCents + employee.confirmedTipWageCents).toBe(employee.confirmedIncomeCents);
    expect(employee.cashLargeFeeDividendCents + employee.cardLargeFeeDividendCents).toBe(employee.confirmedLargeFeeWageCents);
    expect(employee.cashTipDividendCents + employee.cardTipDividendCents).toBe(employee.confirmedTipWageCents);
    const confirmedIncome = snapshot.records.filter(record => record.status === "CONFIRMED").reduce((total, record) => total + (record.employeeIncomeCents ?? 0), 0);
    expect(confirmedIncome).toBe(employee.confirmedIncomeCents);
    expect(snapshot.storeName).toContain("Demo");
  }
});
