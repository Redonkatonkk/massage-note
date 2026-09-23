import { describe, expect, it } from "vitest";
import { formatWorkBotMoney, formatWorkBotTime, parseWorkBotDollars } from "../src/work-bot/work-bot-format.js";

describe("work-bot display helpers", () => {
  it("keeps dollar amounts in integer cents, including omitted or single cents digits", () => {
    expect([parseWorkBotDollars("75"), parseWorkBotDollars("75.4"), parseWorkBotDollars("75.04")]).toEqual([7500n, 7540n, 7504n]);
  });

  it("preserves the safe-integer limit and amount-validation errors", () => {
    expect(parseWorkBotDollars("90071992547409.91")).toBe(BigInt(Number.MAX_SAFE_INTEGER));
    expect(() => parseWorkBotDollars("90071992547409.92")).toThrow(expect.objectContaining({
      response: { code: "AMOUNT_TOTAL_TOO_LARGE", messageZh: "金额超出系统允许范围" },
    }));
    for (const value of ["-1", "1.001"]) {
      expect(() => parseWorkBotDollars(value)).toThrow(expect.objectContaining({
        response: { code: "WORK_BOT_AMOUNT_INVALID", messageZh: "金额必须是整数或最多两位小数" },
      }));
    }
  });

  it("formats signed cents and store-local times", () => {
    expect(formatWorkBotMoney(-4n)).toBe("-$0.04");
    expect(formatWorkBotMoney(7500n)).toBe("$75.00");
    expect(formatWorkBotTime(new Date("2026-09-22T16:05:00.000Z"), "America/New_York")).toBe("12:05");
  });
});
