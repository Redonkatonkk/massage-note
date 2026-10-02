import { describe, expect, it } from "vitest";
import { expenseInputAmount, expenseInputCents, expenseMoney, nextExpenseStart } from "./expense-helpers";
const rule = { id: "r", startDate: "2026-01-01", endExclusive: null, unit: "MONTH" as const, interval: 3, amountMode: "FIXED" as const, amountCents: 100n };
describe("支出编辑辅助函数", () => {
  it("金额字符串按美分转换，不接受浮点截断或科学计数", () => {
    expect(expenseInputCents("1.01")).toBe(101); expect(expenseInputCents("0")).toBe(0);
    expect(expenseInputAmount("9007199254740991")).toBe("90071992547409.91");
    expect(expenseInputCents(expenseInputAmount("9007199254740991"))).toBe(Number.MAX_SAFE_INTEGER);
    for (const value of ["-1", "1.001", "1e3", "", "90071992547409.92"]) expect(() => expenseInputCents(value)).toThrow();
  });
  it("汇总金额超过安全整数仍准确显示美分", () => {
    expect(expenseMoney("18014398509481982", "en-US")).toBe("$180,143,985,094,819.82");
    expect(expenseMoney("0", "zh-CN")).toContain("0.00");
  });
  it("默认变更日期为周期起点，并晚于最新起点或不早于停止日期", () => {
    expect(nextExpenseStart(rule, "2026-02-15")).toBe("2026-04-01");
    expect(nextExpenseStart(rule, "2026-04-01")).toBe("2026-04-01");
    expect(nextExpenseStart(rule, "2026-04-02")).toBe("2026-07-01");
    expect(nextExpenseStart({ ...rule, endExclusive: "2026-10-01" }, "2026-02-15")).toBe("2026-10-01");
    expect(nextExpenseStart({ ...rule, unit: "DAY", startDate: "2026-01-30", interval: 5 }, "2026-02-01")).toBe("2026-02-04");
  });
});
