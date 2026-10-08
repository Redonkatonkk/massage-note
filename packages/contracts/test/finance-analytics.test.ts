import { expect, it } from "vitest";
import { financeAnalyticsQuerySchema } from "../src/finance-analytics.js";
it("经营分析接受全部或合法日期范围，拒绝反向日期、无效日期和其他财务汇总筛选", () => {
  expect(financeAnalyticsQuerySchema.parse({})).toEqual({});
  expect(financeAnalyticsQuerySchema.safeParse({ dateFrom: "2026-09-01", dateTo: "2026-09-19" }).success).toBe(true);
  for (const value of [{ dateFrom: "2026-09-20", dateTo: "2026-09-19" }, { dateFrom: "2026-02-30" }, { paymentMethod: "CASH" }]) expect(financeAnalyticsQuerySchema.safeParse(value).success).toBe(false);
});
it("经营分析接受三种高亮筛选，拒绝未知值", () => {
  for (const highlightFilter of ["ALL", "ONLY_HIGHLIGHTED", "EXCLUDE_HIGHLIGHTED"]) {
    expect(financeAnalyticsQuerySchema.parse({ dateFrom: "2026-09-01", highlightFilter })).toEqual({ dateFrom: "2026-09-01", highlightFilter });
  }
  for (const highlightFilter of ["HIGHLIGHTED", "", true]) {
    expect(financeAnalyticsQuerySchema.safeParse({ highlightFilter }).success).toBe(false);
  }
});
