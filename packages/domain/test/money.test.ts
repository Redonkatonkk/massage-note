import { describe, expect, it } from "vitest";
import {
  DomainError,
  basisPoints,
  cents,
  formatUsd,
  multiplyByBps,
  roundHalfUp,
} from "../src/index.js";

describe("金额基础规则", () => {
  it("只接受整数美分和非负金额", () => {
    expect(cents(1_025)).toBe(1_025n);
    expect(() => cents(10.5)).toThrow(DomainError);
    expect(() => cents(Number.MAX_SAFE_INTEGER + 1)).toThrow(DomainError);
    expect(() => cents(-1)).toThrowError("金额不能为负数");
  });

  it("提成比例限制在 0% 到 100%", () => {
    expect(basisPoints(6_000)).toBe(6_000);
    expect(() => basisPoints(-1)).toThrow(DomainError);
    expect(() => basisPoints(10_001)).toThrow(DomainError);
  });

  it("按半美分向上规则舍入", () => {
    expect(roundHalfUp(1n, 2n)).toBe(1n);
    expect(roundHalfUp(4n, 3n)).toBe(1n);
    expect(roundHalfUp(5n, 3n)).toBe(2n);
  });

  it("逐项计算提成，不使用浮点数", () => {
    expect(multiplyByBps(10_001n, 6_000)).toBe(6_001n);
    expect(multiplyByBps(99n, 5_000)).toBe(50n);
  });

  it("格式化美元", () => {
    expect(formatUsd(0n)).toBe("$0.00");
    expect(formatUsd(12_345n)).toBe("$123.45");
  });
});
