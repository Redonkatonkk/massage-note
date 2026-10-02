import { describe, expect, it } from "vitest";
import { createExpenseSchema, expensePeriodSchema, expenseQuerySchema, reviseExpenseSchema, stopExpenseSchema, updateExpenseSchema } from "../src/expenses.js";
const rule = { startDate: "2026-01-01", unit: "MONTH", interval: 3, amountMode: "FIXED", amountCents: 90000 };
describe("支出输入契约", () => {
  it("支持固定、预算及一次性并去除名称空格", () => {
    expect(createExpenseSchema.parse({ name: " 房租 ", kind: "RECURRING", rule }).name).toBe("房租");
    expect(createExpenseSchema.safeParse({ name: "电费", kind: "RECURRING", rule: { ...rule, amountMode: "BUDGET", interval: 1 } }).success).toBe(true);
    expect(createExpenseSchema.safeParse({ name: "修理", kind: "ONCE", occurredOn: "2026-02-28", amountCents: 100 }).success).toBe(true);
  });
  it.each([{ interval: 0 }, { interval: 1.5 }, { amountCents: -1 }, { amountCents: 1.1 }, { amountCents: Number.MAX_SAFE_INTEGER + 1 }, { startDate: "2026-02-30" }, { startDate: "2026-01-02" }])("拒绝非法规则 %j", change => {
    expect(createExpenseSchema.safeParse({ name: "房租", kind: "RECURRING", rule: { ...rule, ...change } }).success).toBe(false);
  });
  it("天周期可在月中开始；实际零金额合法；版本不可省略", () => {
    expect(createExpenseSchema.safeParse({ name: "清洁", kind: "RECURRING", rule: { ...rule, unit: "DAY", startDate: "2026-01-15" } }).success).toBe(true);
    const period = { version: 1, ruleId: "00000000-0000-4000-8000-000000000001", periodStart: "2026-01-01", amountCents: 0 };
    expect(expensePeriodSchema.safeParse(period).success).toBe(true);
    expect(expensePeriodSchema.safeParse({ ...period, version: undefined }).success).toBe(false);
    expect(reviseExpenseSchema.safeParse({ rule }).success).toBe(false);
    expect(stopExpenseSchema.safeParse({ version: 1, effectiveFrom: "2026-02-30" }).success).toBe(false);
  });
  it("月份完整、字段严格，不能通过更新更改店铺归属或类型", () => {
    expect(expenseQuerySchema.safeParse({ month: "2026-02" }).success).toBe(true);
    expect(expenseQuerySchema.safeParse({ month: "2026-13" }).success).toBe(false);
    expect(updateExpenseSchema.safeParse({ version: 1, storeId: "other" }).success).toBe(false);
    expect(updateExpenseSchema.safeParse({ version: 1, kind: "ONCE" }).success).toBe(false);
  });
});
