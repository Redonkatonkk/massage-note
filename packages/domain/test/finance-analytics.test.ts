import { describe, expect, it } from "vitest";
import { calculateFinanceAnalytics, calculateWeekdayRevenueComparison } from "../src/finance-analytics.js";
const record = (businessDate: string, startAt: string, revenueCents = 10000n, timezone = "America/New_York") => ({ businessDate, startAt: new Date(startAt), revenueCents, timezone });

describe("星期营业额三组对比", () => {
  it("高光、非高光、全部使用同一日结分母，卖卡只进入非高光及全部，先合计再分别舍入", () => {
    const result = calculateWeekdayRevenueComparison({ dateFrom: "2026-10-05", dateTo: "2026-10-12", records: [
      { businessDate: "2026-10-05", revenueCents: 10001n, isHighlighted: true },
      { businessDate: "2026-10-05", revenueCents: 20000n, isHighlighted: false },
      { businessDate: "2026-10-06", revenueCents: 999999n, isHighlighted: true },
      { businessDate: "2026-10-04", revenueCents: 999999n, isHighlighted: true },
    ], sales: [{ businessDate: "2026-10-05", revenueCents: 5001n }], closedDates: ["2026-10-05", "2026-10-05", "2026-10-12"] });
    expect(result.weekdays[0]).toEqual({ weekday: 0, closedDayCount: 2, highlightedAverageCents: "5001", nonHighlightedAverageCents: "12501", averageCents: "17501" });
    expect(result.weekdays[1]).toEqual({ weekday: 1, closedDayCount: 0, highlightedAverageCents: null, nonHighlightedAverageCents: null, averageCents: null });
    expect(result.days[0]).toEqual({ businessDate: "2026-10-05", highlightedRevenueCents: "10001", nonHighlightedRevenueCents: "25001", revenueCents: "35002" });
    expect(result.days[1]).toEqual({ businessDate: "2026-10-06", highlightedRevenueCents: null, nonHighlightedRevenueCents: null, revenueCents: null });
    expect(result.days[7]).toEqual({ businessDate: "2026-10-12", highlightedRevenueCents: "0", nonHighlightedRevenueCents: "0", revenueCents: "0" });
    expect(result.hasData).toBe(true);
  });
  it("无高光成交仍有零值样本；范围外记录和日结不造成当前范围有数据", () => {
    const input = { dateFrom: "2026-10-05", dateTo: "2026-10-05", records: [{ businessDate: "2026-10-05", revenueCents: 12000n, isHighlighted: false }], sales: [], closedDates: ["2026-10-05"] };
    expect(calculateWeekdayRevenueComparison(input).weekdays[0]).toMatchObject({ closedDayCount: 1, highlightedAverageCents: "0", nonHighlightedAverageCents: "12000", averageCents: "12000" });
    expect(calculateWeekdayRevenueComparison({ ...input, dateFrom: "2026-10-06", dateTo: "2026-10-06" }).hasData).toBe(false);
  });
});

describe("经营分析历史口径", () => {
  it("负营业额在星期对比、滚动和累计平均中保留并按负半美分舍入", () => {
    const result = calculateFinanceAnalytics({ dateFrom: "2026-10-05", dateTo: "2026-10-12", records: [
      record("2026-10-05", "2026-10-05T15:00:00Z", -1001n),
    ], sales: [], closedDates: ["2026-10-05", "2026-10-12"] });
    expect(result.days[0]).toMatchObject({ revenueCents: "-1001", averageCents: "-1001", average30Cents: "-1001", cumulativeAverageCents: "-1001" });
    expect(result.days[7]).toMatchObject({ average30Cents: "-501", cumulativeAverageCents: "-501" });
    expect(result.weekdays[0]!.averageCents).toBe("-501");
    const comparison = calculateWeekdayRevenueComparison({ dateFrom: "2026-10-05", dateTo: "2026-10-12", records: [
      { businessDate: "2026-10-05", revenueCents: -1001n, isHighlighted: true },
    ], sales: [], closedDates: ["2026-10-05", "2026-10-12"] });
    expect(comparison.weekdays[0]).toMatchObject({ highlightedAverageCents: "-501", averageCents: "-501" });
  });
  it("30天窗口包含起日前29天，累计平均只含所选区间；未日结留空、空日结计零并按美分舍入", () => {
    const result = calculateFinanceAnalytics({ dateFrom: "2026-10-01", dateTo: "2026-10-03", records: [
      record("2026-09-01", "2026-09-01T15:00:00Z", 999999n),
      record("2026-09-02", "2026-09-02T15:00:00Z", 10001n),
      record("2026-09-24", "2026-09-24T15:00:00Z", 9000n),
      record("2026-10-01", "2026-10-01T15:00:00Z", 20001n),
      record("2026-10-02", "2026-10-02T15:00:00Z", 999999n),
      record("2026-10-04", "2026-10-04T15:00:00Z", 999999n),
    ], sales: [], closedDates: ["2026-09-01", "2026-09-02", "2026-09-24", "2026-09-25", "2026-10-01", "2026-10-01", "2026-10-03", "2026-10-04"] });
    expect(result.days.map(day => day.businessDate)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    expect(result.days[0]).toMatchObject({ averageCents: "10001", averageDayCount: 2, average30Cents: "9751", average30DayCount: 4, cumulativeAverageCents: "20001", cumulativeAverageDayCount: 1 });
    expect(result.days[1]).toMatchObject({ averageCents: null, averageDayCount: 0, average30Cents: null, average30DayCount: 0, cumulativeAverageCents: null, cumulativeAverageDayCount: 0 });
    expect(result.days[2]).toMatchObject({ revenueCents: "0", averageCents: "10001", averageDayCount: 2, average30Cents: "7250", average30DayCount: 4, cumulativeAverageCents: "10001", cumulativeAverageDayCount: 2 });
  });
  it("每天补零，未日结留空，空日结计零，均线读取范围前六天且日结去重", () => {
    const result = calculateFinanceAnalytics({ dateFrom: "2026-09-14", dateTo: "2026-09-21",
      records: [record("2026-09-09", "2026-09-09T15:00:00Z", 10001n), record("2026-09-14", "2026-09-14T15:00:00Z", 20000n), record("2026-09-15", "2026-09-15T15:00:00Z")],
      sales: [{ businessDate: "2026-09-14", revenueCents: 5000n }],
      closedDates: ["2026-09-09", "2026-09-14", "2026-09-14", "2026-09-21"],
    });
    expect(result.days).toHaveLength(8);
    expect(result.days[0]).toMatchObject({ count: 1, revenueCents: "25000", averageCents: "17501", averageDayCount: 2 });
    expect(result.days[1]).toMatchObject({ count: 1, revenueCents: null, averageCents: null, averageDayCount: 0 });
    expect(result.days[7]).toMatchObject({ count: 0, revenueCents: "0", averageCents: "0", averageDayCount: 1 });
    expect(result.weekdays[0]).toMatchObject({ closedDayCount: 2, calendarDayCount: 2, averageCents: "12500" });
    expect(result.weekdays[1]!.averageCents).toBeNull();
    expect(result.hours[11]!.count).toBe(2);
    expect(result.days[0]!.hours[11]).toBe(1);
    expect(result.days[1]!.hours[11]).toBe(1);
    expect(result.days[7]!.hours).toEqual(Array(24).fill(0));
    for (const hour of result.hours) {
      expect(result.days.reduce((sum, day) => sum + day.hours[hour.hour]!, 0)).toBe(hour.count);
    }
    expect(result.hours.reduce((sum, h) => sum + h.count, 0)).toBe(2);
    expect(result.weekdays[0]!.hours[11]).toBe(1);
  });
  it("按快照时区分小时，按保存的营业日分星期，跨午夜不重算日期", () => {
    const result = calculateFinanceAnalytics({ dateFrom: "2026-09-14", dateTo: "2026-09-14", records: [
      record("2026-09-14", "2026-09-15T04:30:00Z"),
      record("2026-09-14", "2026-09-15T04:30:00Z", 10000n, "America/Los_Angeles"),
    ], sales: [], closedDates: [] });
    expect(result.hours[0]!.count).toBe(1);
    expect(result.hours[21]!.count).toBe(1);
    expect(result.weekdays[0]!.hours[0]).toBe(1);
    expect(result.days[0]!.count).toBe(2);
    expect(result.days[0]!.hours[0]).toBe(1);
    expect(result.days[0]!.hours[21]).toBe(1);
  });
  it("夏令时重复小时合并，春季缺失小时为零", () => {
    const fall = calculateFinanceAnalytics({ dateFrom: "2025-11-02", dateTo: "2025-11-02", records: [record("2025-11-02", "2025-11-02T05:30:00Z"), record("2025-11-02", "2025-11-02T06:30:00Z")], sales: [], closedDates: [] });
    expect(fall.hours[1]!.count).toBe(2);
    expect(fall.days[0]!.hours[1]).toBe(2);
    const spring = calculateFinanceAnalytics({ dateFrom: "2026-03-08", dateTo: "2026-03-08", records: [record("2026-03-08", "2026-03-08T06:30:00Z"), record("2026-03-08", "2026-03-08T07:30:00Z")], sales: [], closedDates: [] });
    expect(spring.hours[1]!.count).toBe(1); expect(spring.hours[2]!.count).toBe(0); expect(spring.hours[3]!.count).toBe(1);
  });
  it("空范围不因窗口前的数据被当成有数据", () => {
    const result = calculateFinanceAnalytics({ dateFrom: "2026-09-14", dateTo: "2026-09-14", records: [record("2026-09-13", "2026-09-13T12:00:00Z")], sales: [], closedDates: ["2026-09-13"] });
    expect(result.hasData).toBe(false); expect(result.hours).toHaveLength(24); expect(result.weekdays).toHaveLength(7);
  });
  it("统计跑客数量，不影响成功记工和小时；只有跑客时也算有数据", () => {
    const result = calculateFinanceAnalytics({ dateFrom: "2026-09-14", dateTo: "2026-09-15",
      records: [record("2026-09-14", "2026-09-14T15:00:00Z")], sales: [], closedDates: [],
      lostCustomers: [{ businessDate: "2026-09-14", customerCount: 3 }, { businessDate: "2026-09-14", customerCount: 2 }, { businessDate: "2026-09-15" }],
    });
    expect(result.days.map(day => day.lostCustomerCount)).toEqual([5, 1]);
    expect(result.days[0]!.count).toBe(1);
    expect(result.hours.reduce((sum, hour) => sum + hour.count, 0)).toBe(1);
    const lostOnly = calculateFinanceAnalytics({ dateFrom: "2026-09-14", dateTo: "2026-09-14", records: [], sales: [], closedDates: [], lostCustomers: [{ businessDate: "2026-09-14" }] });
    expect(lostOnly.hasData).toBe(true);
    expect(lostOnly.days[0]).toMatchObject({ count: 0, lostCustomerCount: 1, revenueCents: null });
    const none = calculateFinanceAnalytics({ dateFrom: "2026-09-14", dateTo: "2026-09-14", records: [], sales: [], closedDates: [] });
    expect(none.days[0]!.lostCustomerCount).toBe(0);
  });
});
