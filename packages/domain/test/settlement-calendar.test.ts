import { describe, expect, it } from "vitest";
import { calculateSettlementDays, settlementUnsettledTotal, type SettlementDayIncome } from "../src/index.js";

const days: SettlementDayIncome[] = ["2026-09-30", "2026-10-01", "2026-10-02"].map((businessDate) => ({
  businessDate, hasCash: true, hasNonCash: true, cashIncomeCents: 3400n, nonCashIncomeCents: 5900n,
}));

describe("区间结清和付款金额", () => {
  it("按日期和来源独立覆盖，首尾均包含，重叠确认不重复扣减", () => {
    const result = calculateSettlementDays(days, [
      { periodStart: "2026-09-30", periodEnd: "2026-10-01", paymentScope: "CASH" },
      { periodStart: "2026-10-01", periodEnd: "2026-10-02", paymentScope: "NON_CASH" },
      { periodStart: "2026-10-01", periodEnd: "2026-10-01", paymentScope: "ALL" },
    ], []);
    expect(result.map((day) => [day.cashSettled, day.nonCashSettled])).toEqual([[true, false], [true, true], [false, true]]);
    expect(settlementUnsettledTotal(result, "ALL")).toBe(9300n);
    expect(settlementUnsettledTotal(result, "CASH")).toBe(3400n);
    expect(settlementUnsettledTotal(result, "NON_CASH")).toBe(5900n);
    expect(days[0]?.cashIncomeCents).toBe(3400n);
  });
  it("每日现金标记显示黄色对号，但仍保留现金工资缺口", () => {
    const result = calculateSettlementDays(days.slice(0, 1), [], [{ businessDate: "2026-09-30", cashRetainedCents: 3000n }]);
    expect(result[0]).toMatchObject({ cashSettled: true, cashUnsettledCents: 400n, nonCashUnsettledCents: 5900n });
    expect(settlementUnsettledTotal(result, "ALL")).toBe(6300n);
  });
  it("确认现金范围后不再扣除现金，日结与账本同时存在不会负数", () => {
    const result = calculateSettlementDays(days.slice(0, 1), [{ periodStart: "2026-09-30", periodEnd: "2026-09-30", paymentScope: "CASH" }], [{ businessDate: "2026-09-30", cashRetainedCents: 9000n }]);
    expect(result[0]?.cashUnsettledCents).toBe(0n);
    expect(settlementUnsettledTotal(result, "NON_CASH")).toBe(5900n);
  });
  it("无相关付款来源时不显示对号，空记录不会产生日期", () => {
    const result = calculateSettlementDays([{ businessDate: "2026-10-02", hasCash: false, hasNonCash: true, cashIncomeCents: 0n, nonCashIncomeCents: 100n }], [{ periodStart: "2026-10-01", periodEnd: "2026-10-02", paymentScope: "ALL" }], []);
    expect(result[0]).toMatchObject({ cashSettled: false, nonCashSettled: true });
    expect(calculateSettlementDays([], [], [])).toEqual([]);
  });
});


it("每日全部结清覆盖两种来源及现金工资缺口，取消后恢复未结", () => {
  const income = days.slice(0, 1);
  const settled = calculateSettlementDays(income, [], [{ businessDate: "2026-09-30", cashRetainedCents: 1000n, dailySettlementEnabled: true }]);
  expect(settled[0]).toMatchObject({ dailySettlementEnabled: true, cashSettled: true, nonCashSettled: true, cashUnsettledCents: 0n, nonCashUnsettledCents: 0n });
  expect(settlementUnsettledTotal(settled, "ALL")).toBe(0n);
  expect(settlementUnsettledTotal(calculateSettlementDays(income, [], []), "ALL")).toBe(9300n);
});
