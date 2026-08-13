import { describe, expect, it } from "vitest";
import { financeSummaryMetrics } from "./summary-metrics";

describe("财务汇总指标说明", () => {
  it("只保留 16 个汇总指标并为每项提供解释与计算方法", () => {
    expect(financeSummaryMetrics).toHaveLength(16);
    expect(new Set(financeSummaryMetrics.map((metric) => metric.key)).size).toBe(16);
    expect(financeSummaryMetrics.map((metric) => metric.label)).not.toContain("老板尚欠");
    expect(financeSummaryMetrics.map((metric) => metric.label)).not.toContain("本期工资结算");
    for (const metric of financeSummaryMetrics) {
      expect(metric.explanation.trim()).not.toBe("");
      expect(metric.calculation.trim()).not.toBe("");
    }
  });
});
