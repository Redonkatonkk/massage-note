import { expect, it } from "vitest";
import { financeAnalyticsQuerySchema } from "./finance-analytics.js";
it("经营分析接受全部或合法日期范围，拒绝反向日期、无效日期和财务汇总筛选", () => {
  expect(financeAnalyticsQuerySchema.parse({})).toEqual({});
  expect(financeAnalyticsQuerySchema.safeParse({ dateFrom: "2026-09-01", dateTo: "2026-09-19" }).success).toBe(true);
  for (const value of [{ dateFrom: "2026-09-20", dateTo: "2026-09-19" }, { dateFrom: "2026-02-30" }, { paymentMethod: "CASH" }]) expect(financeAnalyticsQuerySchema.safeParse(value).success).toBe(false);
});
