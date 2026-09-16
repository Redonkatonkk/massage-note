import { describe, expect, it } from "vitest";
import { calculateDiscountAmount, parseDiscountInput } from "../src/index.js";

describe("记工百分比折扣", () => {
  it("支持金额、半角/全角百分号和两位小数", () => {
    expect(parseDiscountInput("10.25")).toEqual({ amountCents: 1025, rateBps: null });
    expect(parseDiscountInput(" 12.25% ")).toEqual({ amountCents: 0, rateBps: 1225 });
    expect(parseDiscountInput("10 ％").rateBps).toBe(1000);
    expect(parseDiscountInput("0%").rateBps).toBe(0);
    expect(parseDiscountInput("100%").rateBps).toBe(10000);
  });
  it.each(["", "%", "-1%", "100.01%", "10%%", "NaN", "1.234%", "9007199254740992"])("拒绝无效输入 %s", (value) => {
    expect(() => parseDiscountInput(value)).toThrow();
  });
  it("主要项目与全部加项合计折扣，金额变更后重新计算", () => {
    expect(calculateDiscountAmount(10000n + 2000n, 0n, 1000)).toBe(1200n);
    expect(calculateDiscountAmount(15000n, 0n, 1000)).toBe(1500n);
    expect(calculateDiscountAmount(12000n, 500n, null)).toBe(500n);
    expect(calculateDiscountAmount(12000n, 500n, 0)).toBe(0n);
    expect(calculateDiscountAmount(12000n, 0n, 10000)).toBe(12000n);
    expect(calculateDiscountAmount(10005n, 0n, 1000)).toBe(1001n);
  });
});
