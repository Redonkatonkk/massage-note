import { describe, expect, it } from "vitest";
import { confirmEmployeeSettlementSchema, employeeSettlementCalendarQuerySchema } from "../src/index.js";

const input = { membershipId: "10000000-0000-4000-8000-000000000001", dateFrom: "2026-09-30", dateTo: "2026-10-02", paymentScope: "ALL", deductionCents: 0, revision: "a".repeat(64) };
describe("工资日历和付款确认契约", () => {
  it("支持零抵扣、整数美分、跨月和同日，拒绝负数、小数美分、倒序与客户端指定实付", () => {
    expect(confirmEmployeeSettlementSchema.safeParse(input).success).toBe(true);
    expect(confirmEmployeeSettlementSchema.safeParse({ ...input, dateTo: input.dateFrom, deductionCents: 125 }).success).toBe(true);
    for (const patch of [{ deductionCents: -1 }, { deductionCents: 0.5 }, { dateTo: "2026-09-29" }, { totalPaidCents: 1 }, { revision: "old" }]) expect(confirmEmployeeSettlementSchema.safeParse({ ...input, ...patch }).success).toBe(false);
  });
  it("月份必须真实有效且员工为 UUID", () => {
    expect(employeeSettlementCalendarQuerySchema.safeParse({ membershipId: input.membershipId, month: "2026-10" }).success).toBe(true);
    for (const month of ["2026-00", "2026-13", "2026-1", "0000-10", "2026-10-01"]) expect(employeeSettlementCalendarQuerySchema.safeParse({ membershipId: input.membershipId, month }).success).toBe(false);
  });
});
