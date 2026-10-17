import { expect, it } from "vitest";
import { smoothChartPath } from "./analytics-curve";

it("用有界贝塞尔曲线连接相邻值，遇到未日结缺口重新起笔", () => {
  const path = smoothChartPath([0, 100, 0, null, 50, 60], index => index * 10, value => value);
  expect(path).toBe("M0,0 C5,0 5,100 10,100 C15,100 15,0 20,0  M40,50 C45,50 45,60 50,60");
  expect(smoothChartPath([null, undefined], index => index, value => value)).toBe(" ");
  expect(smoothChartPath([0], index => index, value => value)).toBe("M0,0");
});
