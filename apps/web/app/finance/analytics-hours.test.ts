import { expect, it } from "vitest";
import { visibleAnalyticsHours } from "./analytics-hours";
const hours = (active: number[]) => Array.from({ length: 24 }, (_, hour) => ({ hour, count: active.includes(hour) ? 1 : 0 }));
it("只保留最早到最晚上工小时，中间空小时保留", () => {
  expect(visibleAnalyticsHours(hours([9, 16])).map(row => row.hour)).toEqual([9,10,11,12,13,14,15,16]);
  expect(visibleAnalyticsHours(hours([9, 16]))[1]!.count).toBe(0);
});
it("支持单小时、午夜和无记工", () => {
  expect(visibleAnalyticsHours(hours([12]))).toEqual([{ hour: 12, count: 1 }]);
  expect(visibleAnalyticsHours(hours([0, 23]))).toHaveLength(24);
  expect(visibleAnalyticsHours(hours([]))).toEqual([]);
});
