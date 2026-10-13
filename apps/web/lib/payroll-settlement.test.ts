import { describe, expect, it } from "vitest";
import { payrollAmountCents } from "./payroll-settlement";

describe("工资金额输入", () => {
  it("金额精确保留美分，拒绝负数、超过两位小数和不安全数额", () => {
    expect(payrollAmountCents("123.45")).toBe(12345);
    expect(payrollAmountCents("0.29")).toBe(29);
    expect(payrollAmountCents(" 0 ")).toBe(0);
    for (const value of ["", "-1", "1.234", "NaN", "1e3", "900719925474099.99"]) {
      expect(() => payrollAmountCents(value)).toThrow();
    }
  });
});
