import { describe, expect, it } from "vitest";
import { calculateFinanceAnalytics } from "../src/finance-analytics.js";
const record = (businessDate: string, startAt: string, revenueCents = 10000n, timezone = "America/New_York") => ({ businessDate, startAt: new Date(startAt), revenueCents, timezone });

describe("经营分析历史口径", () => {
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
      lostCustomers: [{ businessDate: "2026-09-14" }, { businessDate: "2026-09-14" }, { businessDate: "2026-09-15" }],
    });
    expect(result.days.map(day => day.lostCustomerCount)).toEqual([2, 1]);
    expect(result.days[0]!.count).toBe(1);
    expect(result.hours.reduce((sum, hour) => sum + hour.count, 0)).toBe(1);
    const lostOnly = calculateFinanceAnalytics({ dateFrom: "2026-09-14", dateTo: "2026-09-14", records: [], sales: [], closedDates: [], lostCustomers: [{ businessDate: "2026-09-14" }] });
    expect(lostOnly.hasData).toBe(true);
    expect(lostOnly.days[0]).toMatchObject({ count: 0, lostCustomerCount: 1, revenueCents: null });
    const none = calculateFinanceAnalytics({ dateFrom: "2026-09-14", dateTo: "2026-09-14", records: [], sales: [], closedDates: [] });
    expect(none.days[0]!.lostCustomerCount).toBe(0);
  });
});
