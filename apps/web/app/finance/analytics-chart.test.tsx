// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Chart, type ChartPoint } from "./analytics-chart";

vi.mock("../language-provider", () => ({ useLanguage: () => ({ locale: "zh-CN" }) }));
let root: Root;
let container: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
const labels = () => [...container.querySelectorAll<SVGTextElement>(".analytics-bar-value")];

it("负营业额及均线仍绘制在图内，零与未日结缺口保留", async () => {
  await act(async () => root.render(<Chart title="营业额" description="" currency points={[
    { label: "10-01", value: -10.01, detail: "-$10.01" },
    { label: "10-02", value: null, detail: "未日结" },
    { label: "10-03", value: 0, detail: "$0" },
  ]} />));
  const points = [...container.querySelectorAll<SVGCircleElement>("circle")];
  expect(points.length).toBeGreaterThan(0);
  for (const point of points) expect(Number(point.getAttribute("cy"))).toBeLessThanOrEqual(225);
  expect(container.querySelector("svg")!.textContent).toContain("$-15");
});

it("数量柱顶同时标注记工和跑客，保留零值，未录入仍为破折号", async () => {
  await act(async () => root.render(<Chart title="数量" description="" bars points={[
    { label: "10-01", value: 2, lostCount: 3, detail: "2 笔，跑客 3 人" },
    { label: "10-02", value: 0, detail: "0 笔" },
    { label: "10-03", value: null, detail: "未知" },
  ]} />));
  expect(labels().map(text => text.textContent)).toEqual(["2", "+3", "0"]);
  expect(Number(labels()[1]!.getAttribute("y")) - Number(labels()[0]!.getAttribute("y"))).toBeGreaterThanOrEqual(16);
  expect(container.querySelector("svg")!.textContent).toContain("—");
  expect(labels().every(text => Number(text.getAttribute("y")) >= 14)).toBe(true);
});

it("分组柱保留美分、负金额、零值和无样本，负值标签位于柱尾下方", async () => {
  await act(async () => root.render(<Chart title="金额" description="" bars currency
    series={[
      { id: "positive", color: "var(--brand)", values: [1234.56, null] },
      { id: "negative", color: "var(--ink)", values: [-15.25, 0] },
    ]} points={[{ label: "一", value: null, detail: "金额" }, { label: "二", value: null, detail: "金额" }]} />));
  expect(labels().map(text => text.textContent)).toEqual(["$1,234.56", "-$15.25", "—", "$0"]);
  const negative = container.querySelector<SVGRectElement>('rect[data-series="negative"]')!;
  const negativeLabel = container.querySelector<SVGTextElement>('text[data-series="negative"]')!;
  expect(Number(negativeLabel.getAttribute("y"))).toBeGreaterThan(Number(negative.getAttribute("y")) + Number(negative.getAttribute("height")));
  expect(Number(negativeLabel.getAttribute("y"))).toBeLessThan(280);
});

it("密集三组金额按完整标签预留横向空间，标签不相互覆盖且留在图内", async () => {
  const points: ChartPoint[] = Array.from({ length: 31 }, (_, i) => ({ label: `2026-10-${String(i + 1).padStart(2, "0")}`, value: null, detail: "金额" }));
  await act(async () => root.render(<Chart title="每天金额" description="" bars currency points={points}
    series={Array.from({ length: 3 }, (_, i) => ({ id: String(i), color: "var(--brand)", values: points.map(() => 12345.67 + i) }))} />));
  const width = Number(container.querySelector("svg")!.getAttribute("width"));
  expect(container.querySelector(".analytics-scroll")).not.toBeNull();
  expect(labels()).toHaveLength(93);
  let previousRight = 0;
  for (const text of labels()) {
    const center = Number(text.getAttribute("x"));
    const halfWidth = text.textContent!.length * 4.5;
    expect(center - halfWidth).toBeGreaterThan(previousRight);
    expect(center + halfWidth).toBeLessThan(width);
    previousRight = center + halfWidth;
  }
});

it.each([220, 320, 600, 1200, 2400])("纵向排列的三组柱图在 %ipx 内保留完整金额、负值与缺口", async width => {
  let resize!: (width: number) => void;
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) { resize = width => callback([{ contentRect: { width } } as ResizeObserverEntry], this as unknown as ResizeObserver); }
    observe() {} disconnect() {}
  });
  const values = [1234.56, -15.25, 0, null, 12345.67, 12.34, 987.65];
  await act(async () => root.render(<Chart title="星期平均营业额" description="" bars horizontalBars currency
    points={values.map((_, i) => ({ label: `星期${"一二三四五六日"[i]}`, value: null, detail: "金额", dailyRevenueDetails: [] }))}
    series={Array.from({ length: 3 }, (_, i) => ({ id: String(i), color: "var(--brand)", values }))} />));
  await act(async () => resize(width));
  const groups = [...container.querySelectorAll(".analytics-horizontal-bars > svg")];
  expect(groups).toHaveLength(7);
  expect(groups.every(svg => svg.getAttribute("width") === "100%" && svg.getAttribute("viewBox") === `0 0 ${width} 116`)).toBe(true);
  expect(container.querySelector(".analytics-scroll")).toBeNull();
  expect(container.querySelectorAll(".analytics-axis-label")).toHaveLength(7);
  expect(labels()).toHaveLength(21);
  expect(labels().map(text => text.textContent)).toContain("$12,345.67");
  expect(labels().map(text => text.textContent)).toContain("-$15.25");
  expect(labels().map(text => text.textContent)).toContain("$0");
  expect(labels().map(text => text.textContent)).toContain("—");
  for (const group of groups) {
    const zero = Number(group.querySelector(".analytics-zero-line")!.getAttribute("x1"));
    const amounts = [...group.querySelectorAll<SVGTextElement>(".analytics-bar-value")];
    for (const [index, amount] of amounts.entries()) {
      expect(amount.hasAttribute("transform")).toBe(false);
      expect(Number(amount.getAttribute("x"))).toBe(width - 4);
      const amountLeft = width - 4 - amount.textContent!.length * 9;
      const bar = group.querySelector<SVGRectElement>(`rect[data-series="${index}"]`);
      if (bar) {
        const left = Number(bar.getAttribute("x")), barWidth = Number(bar.getAttribute("width"));
        expect(left).toBeGreaterThanOrEqual(0);
        expect(left + barWidth).toBeLessThan(amountLeft);
        if (amount.textContent!.startsWith("-")) expect(left + barWidth).toBeCloseTo(zero);
        else expect(left).toBeCloseTo(zero);
      }
      if (index > 0) expect(Number(amount.getAttribute("y")) - Number(amounts[index - 1]!.getAttribute("y"))).toBeGreaterThanOrEqual(28);
    }
    const hit = group.querySelector<SVGRectElement>(".analytics-hit")!;
    expect(Number(hit.getAttribute("width"))).toBe(width);
    expect(Number(hit.getAttribute("height"))).toBe(116);
  }
});
