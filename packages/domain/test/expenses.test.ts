import { describe, expect, it } from "vitest";
import { calculateExpenseMonth, isExpenseBoundary, type ExpenseItem, type ExpenseRule } from "../src/expenses.js";
import { hasStoreCapability } from "../src/permission.js";
const rule = (changes: Partial<ExpenseRule> = {}): ExpenseRule => ({ id: "r", startDate: "2026-01-01", endExclusive: null, unit: "MONTH", interval: 1, amountMode: "FIXED", amountCents: 300000n, ...changes });
const item = (rules = [rule()], changes: Partial<ExpenseItem> = {}): ExpenseItem => ({ id: "e", name: "房租", kind: "RECURRING", deleted: false, occurredOn: null, amountCents: null, rules, overrides: [], ...changes });
const sum = (month: string, expense = item()) => calculateExpenseMonth(month, [expense]);
describe("店铺月支出", () => {
  it.each([["2026-01", 31, "9677"], ["2026-02", 28, "10714"], ["2024-02", 29, "10345"], ["2026-04", 30, "10000"]])("%s 使用整月 %s 天，不依赖营业日或今天", (month, days, average) => {
    expect(sum(String(month), item([rule({ startDate: "2024-01-01" })]))).toMatchObject({ totalCents: "300000", dailyAverageCents: average, daysInMonth: days });
  });
  it("季度按自然月均分，余数归较早月份，查询顺序不影响结果", () => {
    const quarterly = item([rule({ interval: 3, amountCents: 90001n })]);
    expect(["2026-03", "2026-01", "2026-02"].map(m => sum(m, quarterly).totalCents)).toEqual(["30000", "30001", "30000"]);
    expect(sum("2026-04", quarterly).totalCents).toBe("30001");
    expect(sum("2025-12", quarterly).totalCents).toBe("0");
  });
  it("天周期跨月跨年按天分摊，停止不截断已开始周期", () => {
    const expense = item([rule({ unit: "DAY", startDate: "2025-12-30", endExclusive: "2026-01-04", interval: 5, amountCents: 11n })]);
    expect(sum("2025-12", expense).totalCents).toBe("5");
    expect(sum("2026-01", expense).totalCents).toBe("6");
    expect(sum("2026-02", expense).totalCents).toBe("0");
    expect(sum("2026-01", expense).lines[0]?.periodEnd).toBe("2026-01-03");
  });
  it("查询的月份内可覆盖多个天周期，仅计算开始之后日期", () => {
    const expense = item([rule({ unit: "DAY", interval: 10, startDate: "2026-01-15", amountCents: 1000n })]);
    expect(sum("2026-01", expense)).toMatchObject({ totalCents: "1700", daysInMonth: 31, dailyAverageCents: "55" });
    expect(sum("2026-01", expense).lines).toHaveLength(2);
    expect(sum("2026-02", expense).totalCents).toBe("2800");
  });
  it("浮动预算被实际账单覆盖，包括零；清除后恢复预算", () => {
    const expense = item([rule({ amountMode: "BUDGET", amountCents: 10000n })]);
    expect(sum("2026-01", expense)).toMatchObject({ totalCents: "10000", budgetCents: "10000" });
    expense.overrides.push({ ruleId: "r", periodStart: "2026-01-01", amountCents: 0n });
    expect(sum("2026-01", expense)).toMatchObject({ totalCents: "0", budgetCents: "0" });
    expect(sum("2026-01", expense).lines[0]).toMatchObject({ source: "ACTUAL", hasOverride: true });
    expect(sum("2026-02", expense).budgetCents).toBe("10000");
    expense.overrides = [];
    expect(sum("2026-01", expense).budgetCents).toBe("10000");
  });
  it("整期覆盖金额分摊到所有覆盖月份，只计一次", () => {
    const expense = item([rule({ interval: 3, amountMode: "BUDGET", amountCents: 90000n })], { overrides: [{ ruleId: "r", periodStart: "2026-01-01", amountCents: 120001n }] });
    const months = ["2026-01", "2026-02", "2026-03"].map(m => sum(m, expense));
    expect(months.map(m => m.totalCents)).toEqual(["40001", "40000", "40000"]);
    expect(months.map(m => m.budgetCents)).toEqual(["0", "0", "0"]);
  });
  it("新增规则保留历史，停止仍保留最后周期覆盖月份，重新开始允许间隔", () => {
    const expense = item([rule({ endExclusive: "2026-04-01", interval: 3, amountCents: 90000n }), rule({ id: "r2", startDate: "2026-04-01", interval: 3, amountCents: 120000n, endExclusive: "2026-07-01" }), rule({ id: "r3", startDate: "2026-10-01", amountCents: 45000n })]);
    expect(["2026-03", "2026-04", "2026-06", "2026-07", "2026-10"].map(m => sum(m, expense).totalCents)).toEqual(["30000", "40000", "40000", "0", "45000"]);
  });
  it("一次性支出只计发生月，删除排除，恢复重新计入；空月零", () => {
    const expense = item([], { kind: "ONCE", occurredOn: "2026-02-28", amountCents: 2801n });
    expect(sum("2026-02", expense)).toMatchObject({ totalCents: "2801", dailyAverageCents: "100", budgetCents: "0" });
    expect(sum("2026-03", expense).totalCents).toBe("0");
    expense.deleted = true; expect(sum("2026-02", expense).totalCents).toBe("0");
    expense.deleted = false; expect(sum("2026-02", expense).totalCents).toBe("2801");
    expect(calculateExpenseMonth("2026-02", [])).toMatchObject({ totalCents: "0", dailyAverageCents: "0", lines: [] });
  });
  it("金额合计超出 JS 安全整数仍精确", () => {
    const large = item([rule({ amountCents: 9007199254740991n })]);
    expect(calculateExpenseMonth("2026-01", [large, { ...large, id: "other" }]).totalCents).toBe("18014398509481982");
  });
  it("规则边界随锚点确定，不接受开始之前或月中生效", () => {
    expect(isExpenseBoundary(rule({ interval: 3 }), "2026-04-01")).toBe(true);
    expect(isExpenseBoundary(rule({ interval: 3 }), "2026-02-01")).toBe(false);
    expect(isExpenseBoundary(rule(), "2026-04-02")).toBe(false);
    expect(isExpenseBoundary(rule(), "2025-12-01")).toBe(false);
    expect(isExpenseBoundary(rule({ unit: "DAY", interval: 5, startDate: "2026-01-30" }), "2026-02-04")).toBe(true);
  });
  it("店主经理可管理，员工不能读取或修改店铺支出", () => {
    expect(hasStoreCapability("OWNER", "EXPENSE_MANAGE")).toBe(true);
    expect(hasStoreCapability("MANAGER", "EXPENSE_MANAGE")).toBe(true);
    expect(hasStoreCapability("EMPLOYEE", "EXPENSE_MANAGE")).toBe(false);
  });
});
