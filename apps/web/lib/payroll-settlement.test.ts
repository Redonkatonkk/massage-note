import { describe, expect, it } from "vitest";
import { hasMatchingPayrollEntry, payrollAmountCents, payrollEntryFromPreview } from "./payroll-settlement";
import type { EmployeeSettlementPreview, PayrollSettlement } from "./types";

describe("结算单登记已付工资", () => {
  it.each(["CASH", "NON_CASH", "ALL"] as const)("直接提取 %s 结算单的金额和范围", (paymentScope) => {
    const preview = { employee: { membershipId: "employee" }, dateFrom: "2026-09-01", dateTo: "2026-09-30", paymentScope, summary: { totalIncomeCents: 12345 } } as EmployeeSettlementPreview;
    expect(payrollEntryFromPreview(preview)).toEqual({ membershipId: "employee", periodStart: "2026-09-01", periodEnd: "2026-09-30", totalPaidCents: 12345, paymentScope });
  });

  it("识别同一结算单已登记，忽略删除、不同员工/金额/来源/区间的记录", () => {
    const entry = { membershipId: "employee", periodStart: "2026-09-01", periodEnd: "2026-09-30", totalPaidCents: 12345, paymentScope: "CASH" as const };
    const item = { ...entry, periodStart: `${entry.periodStart}T00:00:00.000Z`, deletedAt: null } as PayrollSettlement;
    expect(hasMatchingPayrollEntry([item], entry)).toBe(true);
    for (const patch of [{ deletedAt: "2026-09-30" }, { membershipId: "other" }, { totalPaidCents: 1 }, { paymentScope: "ALL" }, { paymentScope: null }, { periodEnd: "2026-09-29" }]) {
      expect(hasMatchingPayrollEntry([{ ...item, ...patch } as PayrollSettlement], entry)).toBe(false);
    }
  });

  it("金额精确保留美分，拒绝负数、超过两位小数和不安全数额", () => {
    expect(payrollAmountCents("123.45")).toBe(12345);
    expect(payrollAmountCents("0.29")).toBe(29);
    expect(payrollAmountCents(" 0 ")).toBe(0);
    for (const value of ["", "-1", "1.234", "NaN", "1e3", "900719925474099.99"]) {
      expect(() => payrollAmountCents(value)).toThrow();
    }
  });
});
