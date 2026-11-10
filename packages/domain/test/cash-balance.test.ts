import { describe, expect, it } from "vitest";
import { calculateCashBalance, cashResetDate } from "../src/index.js";

describe("cash drawer reset dates", () => {
  it.each([
    ["2026-11-09", "WEEKLY", 1, 1, "2026-11-09"],
    ["2026-11-15", "WEEKLY", 1, 1, "2026-11-09"],
    ["2026-11-16", "WEEKLY", 1, 1, "2026-11-16"],
    ["2027-01-01", "WEEKLY", 7, 1, "2026-12-27"],
    ["2026-02-27", "MONTHLY", 1, 31, "2026-01-31"],
    ["2026-02-28", "MONTHLY", 1, 31, "2026-02-28"],
    ["2028-02-28", "MONTHLY", 1, 30, "2028-01-30"],
    ["2028-02-29", "MONTHLY", 1, 30, "2028-02-29"],
    ["2026-04-30", "MONTHLY", 1, 31, "2026-04-30"],
    ["2027-01-01", "MONTHLY", 1, 15, "2026-12-15"],
    ["2026-11-09", "MONTHLY", 1, 1, "2026-11-01"],
  ])("%s %s reset", (date, cycle, weekday, monthDay, expected) => {
    expect(cashResetDate(date, cycle, weekday, monthDay)).toBe(expected);
  });
  it("rejects invalid dates and settings", () => {
    expect(() => cashResetDate("2026-02-30", "MONTHLY", 1, 1)).toThrow();
    expect(() => cashResetDate("2026-11-09", "WEEKLY", 0, 1)).toThrow();
    expect(() => cashResetDate("2026-11-09", "MONTHLY", 1, 32)).toThrow();
  });
  it("starts at $200 and preserves exact cents, zero and negative balances", () => {
    expect(calculateCashBalance(20000n, [3501n, -10002n])).toBe(13499n);
    expect(calculateCashBalance(20000n, [-20000n])).toBe(0n);
    expect(calculateCashBalance(20000n, [-20001n])).toBe(-1n);
    expect(calculateCashBalance(20000n, [])).toBe(20000n);
  });
});
