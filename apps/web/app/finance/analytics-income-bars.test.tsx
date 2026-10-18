// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { FinanceSummaryResponse } from "../../lib/types";
import { AnalyticsIncomeBars, type AnalyticsIncomeData } from "./analytics-income-bars";

const language = vi.hoisted(() => ({ locale: "zh-CN" }));
vi.mock("../language-provider", () => ({ useLanguage: () => language }));
let root: Root;
let container: HTMLDivElement;
const retry = vi.fn();
const days = [
  { businessDate: "2026-09-30", dailyTurnoverCents: 10001, storeIncomeCents: 4000, totalIncomeCents: 8000 },
  { businessDate: "2026-10-04", dailyTurnoverCents: 20002, storeIncomeCents: 6000, totalIncomeCents: 12000 },
  { businessDate: "2026-10-05", dailyTurnoverCents: 30003, storeIncomeCents: -1500, totalIncomeCents: 2500 },
] as FinanceSummaryResponse["days"];

async function render(overrides: Partial<AnalyticsIncomeData> = {}) {
  await act(async () => root.render(<AnalyticsIncomeBars days={days} dateFrom="2026-09-30" dateTo="2026-10-06" loading={false} failed={false} error="" retry={retry} {...overrides} />));
}
async function select(value: string) {
  await act(async () => {
    const input = container.querySelector("select")!;
    input.value = value; input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  language.locale = "zh-CN"; retry.mockReset();
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it("默认每周，三项并排绘制并标注金额，支持聚焦读数及负收入", async () => {
  await render();
  expect(container.querySelector("select")!.value).toBe("WEEK");
  expect([...container.querySelectorAll(".analytics-income-legend li")].map(item => item.textContent)).toEqual(["总流水", "店铺收入", "总收入"]);
  const bars = [...container.querySelectorAll<SVGRectElement>("rect[data-series]")];
  expect(bars).toHaveLength(6);
  expect(new Set(bars.slice(0, 3).map(bar => bar.getAttribute("x"))).size).toBe(3);
  expect(new Set(bars.slice(0, 3).map(bar => bar.getAttribute("fill"))).size).toBe(3);
  expect(container.querySelectorAll(".analytics-bar-value")).toHaveLength(6);
  expect([...container.querySelectorAll(".analytics-bar-value")].map(text => text.textContent)).toEqual(["$300.03", "$100", "$200", "$300.03", "-$15", "$25"]);
  expect(container.querySelector(".analytics-scroll > svg")).not.toBeNull();
  const zeroY = Number(container.querySelector(".analytics-zero-line")!.getAttribute("y1"));
  const negative = bars[4]!;
  expect(Number(negative.getAttribute("y"))).toBe(zeroY);
  expect(Number(negative.getAttribute("height"))).toBeGreaterThan(0);
  await act(async () => container.querySelector(".analytics-hit")!.dispatchEvent(new FocusEvent("focusin", { bubbles: true })));
  const readout = container.querySelector(".analytics-readout")!.textContent;
  expect(readout).toContain("2026-09-30 — 2026-10-04");
  expect(readout).toContain("总流水 US$300.03 · 店铺收入 US$100.00 · 总收入 US$200.00");
  expect(container.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
});

it("切换每天和每月即时重分组，数据表保留全部金额及所选区间", async () => {
  await render();
  await select("DAY");
  expect(container.querySelectorAll("rect[data-series]")).toHaveLength(21);
  const rows = [...container.querySelectorAll("tbody tr")];
  expect(rows[0]!.textContent).toContain("2026-09-30");
  expect(rows[6]!.textContent).toContain("2026-10-06");
  expect(rows[1]!.textContent).toContain("总流水 US$0.00 · 店铺收入 US$0.00 · 总收入 US$0.00");
  await select("MONTH");
  expect(container.querySelectorAll("rect[data-series]")).toHaveLength(6);
  expect(container.querySelectorAll("tbody tr")[1]!.textContent).toContain("2026-10-01 — 2026-10-06 · 总流水 US$500.05 · 店铺收入 US$45.00 · 总收入 US$145.00");
});

it("加载、失败重试及空状态保留图表位置，数据恢复后展示当前金额", async () => {
  await render({ days: [], loading: true });
  expect(container.textContent).toContain("正在读取流水与收入");
  expect(container.querySelector(".analytics-plot")).toBeNull();
  await render({ days: [], failed: true, error: "读取失败" });
  await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
  expect(retry).toHaveBeenCalledOnce();
  await render({ days: [] });
  expect(container.textContent).toContain("当前范围没有财务数据");
  await render();
  expect(container.querySelectorAll("rect[data-series]")).toHaveLength(6);
});

it("英文周期、图例和金额口径可读", async () => {
  language.locale = "en-US"; await render();
  expect([...container.querySelectorAll("option")].map(option => option.textContent)).toEqual(["Daily", "Weekly", "Monthly"]);
  expect(container.textContent).toContain("Weeks run Monday–Sunday");
  expect(container.textContent).toContain("before card fees");
  expect(container.querySelector("tbody")!.textContent).toContain("Total turnover $300.03");
});
