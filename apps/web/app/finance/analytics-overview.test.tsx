// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { FinanceAnalyticsTrends, FinanceTrendComparison } from "@massage-note/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AnalyticsOverview } from "./analytics-overview";

const language = vi.hoisted(() => ({ locale: "zh-CN" }));
vi.mock("../language-provider", () => ({ useLanguage: () => language }));
let root: Root, container: HTMLDivElement;
function comparison(current: string, previous: string, change: number): FinanceTrendComparison {
  return {
    current: { dateFrom: "2026-09-08", dateTo: "2026-10-07", closedDayCount: 30, value: current },
    previous: { dateFrom: "2026-08-09", dateTo: "2026-09-07", closedDayCount: 30, value: previous },
    changeTenthsPercent: change, difference: "0", direction: change > 0 ? "UP" : change < 0 ? "DOWN" : "FLAT", status: "COMPARABLE",
  };
}
function trends(): FinanceAnalyticsTrends {
  const revenue7 = comparison("120001", "100001", 200);
  revenue7.current = { ...revenue7.current, dateFrom: "2026-10-01", closedDayCount: 7 };
  revenue7.previous = { ...revenue7.previous, dateFrom: "2026-09-24", dateTo: "2026-09-30", closedDayCount: 7 };
  return { asOf: "2026-10-07", revenue7, revenue30: comparison("90001", "100001", -100), records30: comparison("18.4", "20.0", -80), income30: comparison("1800001", "1800001", 0) };
}
async function render(data: FinanceAnalyticsTrends | null, props = {}) { await act(async () => root.render(<AnalyticsOverview trends={data} {...props} />)); }
const card = (key: string) => container.querySelector(`[data-metric="${key}"]`)!;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  language.locale = "zh-CN";
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it.each(["zh-CN", "en-US"])("四项以环比为主，保留日期、样本、金额美分与日单量一位小数：%s", async locale => {
  language.locale = locale;
  const en = locale === "en-US";
  await render(trends());
  expect([...container.querySelectorAll("dt")].map(node => node.textContent)).toEqual(en
    ? ["7-day change", "30-day change", "30-day daily service count change", "30-day total income change"]
    : ["7天环比", "30天环比", "30天平均日单量环比", "30天总收入环比"]);
  expect([...container.querySelectorAll(".analytics-overview__change")].map(node => node.textContent)).toEqual(["↑ 20.0%", "↓ 10.0%", "↓ 8.0%", "→ 0.0%"]);
  expect(card("revenue7").textContent).toContain("$1,200.01");
  expect(card("income30").textContent).toContain("$18,000.01");
  expect(card("records30").textContent).toContain(en ? "18.4 records/day" : "18.4 单／日");
  expect(card("revenue7").textContent).toContain("2026-09-24 — 2026-09-30");
  expect(card("revenue7").textContent).toContain("7/7");
  expect(card("revenue30").textContent).toContain("2026-08-09 — 2026-09-07");
  expect(card("revenue30").textContent).toContain("30/30");
  expect(container.querySelector("time")!.dateTime).toBe("2026-10-07");
  expect(container.textContent).toContain(en ? "after card fees" : "已扣刷卡手续费");
  expect(card("revenue7").textContent).toContain(en ? "Up" : "上涨");
  expect(card("income30").textContent).toContain(en ? "Unchanged" : "持平");
});

it("无基期仍显示本期，零基期新增、负基期绝对变化及样本差异均有说明", async () => {
  const data = trends();
  Object.assign(data.revenue7, { status: "NO_BASELINE", changeTenthsPercent: null, direction: null, difference: null });
  data.revenue7.previous = { ...data.revenue7.previous, closedDayCount: 0, value: null };
  Object.assign(data.revenue30, { status: "NEW", changeTenthsPercent: null, difference: "90001", direction: "UP" });
  Object.assign(data.records30, { status: "ZERO_BASELINE", changeTenthsPercent: null, difference: "-1.2", direction: "DOWN" });
  Object.assign(data.income30, { status: "NEGATIVE_BASELINE", changeTenthsPercent: null, difference: "-12345", direction: "DOWN" });
  data.income30.current.value = "-1800001";
  await render(data);
  expect(card("revenue7").textContent).toContain("暂无可比数据");
  expect(card("revenue7").textContent).toContain("$1,200.01");
  expect(card("revenue7").textContent).toContain("两期已日结样本天数不同");
  expect(card("revenue30").querySelector(".analytics-overview__change")!.textContent).toBe("新增");
  expect(card("records30").textContent).toContain("上期为零，无法计算比例 · 变化 -1.2");
  expect(card("income30").textContent).toContain("上期为负数，无法计算比例 · 变化 -US$123.45");
  expect(card("income30").textContent).toContain("-US$18,000.01");
  expect(container.textContent).not.toContain("%");
});

it("加载、失败和无日结均保留四卡，用占位区分真实零值", async () => {
  await render(null, { loading: true });
  expect(container.querySelectorAll(".analytics-overview__metric")).toHaveLength(4);
  expect(container.textContent).toContain("正在更新");
  expect(container.textContent).not.toContain("0.0%");
  await render(trends(), { loading: true });
  expect(card("revenue7").textContent).toContain("20.0%");
  expect(container.querySelector("section")!.getAttribute("aria-busy")).toBe("true");
  await render(trends(), { failed: true });
  expect(container.textContent).toContain("请重试");
  expect(container.textContent).not.toContain("20.0%");
  await render(null);
  expect(container.textContent).toContain("暂无已日结数据");
});
