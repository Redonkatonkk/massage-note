import { describe, expect, it } from "vitest";
import { financeSummaryGroups, financeSummaryMetrics } from "./summary-metrics";

describe("财务汇总指标说明", () => {
  it("保留 18 个汇总指标并为每项提供解释与计算方法", () => {
    expect(financeSummaryMetrics).toHaveLength(18);
    expect(new Set(financeSummaryMetrics.map((metric) => metric.key)).size).toBe(18);
    expect(financeSummaryMetrics.map((metric) => metric.label)).not.toContain("老板尚欠");
    expect(financeSummaryMetrics.map((metric) => metric.label)).not.toContain("本期工资结算");
    for (const metric of financeSummaryMetrics) {
      expect(metric.explanation.trim()).not.toBe("");
      expect(metric.calculation.trim()).not.toBe("");
    }
  });

  it("按用途组织全部指标且不重复", () => {
    const groupedKeys = financeSummaryGroups.flatMap((group) => group.metricKeys);
    expect(groupedKeys).toHaveLength(financeSummaryMetrics.length);
    expect(new Set(groupedKeys).size).toBe(financeSummaryMetrics.length);
    expect(new Set(groupedKeys)).toEqual(new Set(financeSummaryMetrics.map((metric) => metric.key)));
    expect(financeSummaryGroups[0]).toMatchObject({ key: "overview", emphasis: true });
  });
});
