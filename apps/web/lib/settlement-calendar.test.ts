import { describe, expect, it } from "vitest";
import { selectSettlementDate, settlementMonthDays, shiftSettlementMonth } from "./settlement-calendar";

describe("工资日历日期范围", () => {
  const initial = { dateFrom: "2026-10-01", dateTo: "2026-10-02", selectingEnd: false };
  it("第一次重新选开始，第二次同日或跨月结束，第三次重新开始", () => {
    const start = selectSettlementDate(initial, "2026-09-30");
    expect(start).toEqual({ dateFrom: "2026-09-30", dateTo: "", selectingEnd: true });
    expect(selectSettlementDate(start, "2026-09-30").dateTo).toBe("2026-09-30");
    const crossMonth = selectSettlementDate(start, "2026-10-02");
    expect(crossMonth).toEqual({ dateFrom: "2026-09-30", dateTo: "2026-10-02", selectingEnd: false });
    expect(selectSettlementDate(crossMonth, "2026-10-05").dateTo).toBe("");
  });
  it("结束日期早于开始日期时改选开始日期", () => {
    expect(selectSettlementDate({ ...initial, dateTo: "", selectingEnd: true }, "2026-09-28")).toEqual({ dateFrom: "2026-09-28", dateTo: "", selectingEnd: true });
  });
  it("跨年换月，星期一开始，正确显示闰年和夏令时月份", () => {
    expect(shiftSettlementMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftSettlementMonth("2026-01", -1)).toBe("2025-12");
    expect(settlementMonthDays("2024-02").filter(Boolean)).toHaveLength(29);
    expect(settlementMonthDays("2026-03").filter(Boolean)).toHaveLength(31);
    expect(settlementMonthDays("2026-10").slice(0, 4)).toEqual([null, null, null, "2026-10-01"]);
    expect(settlementMonthDays("2026-10").length % 7).toBe(0);
  });
});
