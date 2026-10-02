import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CashSettlementRow, ClosingEmployeeTotals } from "../../lib/types";
import { CashSettlementDetails, ClosingEmployeeTable } from "./closing-employee-table";

const employee = (membershipId: string): ClosingEmployeeTotals => ({
  membershipId, displayName: membershipId, role: "EMPLOYEE", recordCount: 1,
  grossFeeBaseCents: 10000, discountTotalCents: 0, discountedFeePerformanceCents: 10000,
  totalTipCents: 1000, customerTotalPaidCents: 11000, totalLargeFeeWageCents: 6000,
  employeeIncomeCents: 7000, incompleteRecordCount: 0, cashToSubmitToStoreCents: 444400,
  cashLargeFeeDividendCents: 6000, cashTipDividendCents: 1000, cardLargeFeeDividendCents: 0, cardTipDividendCents: 0,
});
const cashRow = (membershipId: string, status: CashSettlementRow["status"] = "UNSETTLED"): CashSettlementRow => ({
  membershipId, displayName: membershipId, role: "EMPLOYEE", cashServiceCents: 10000,
  cashTipCents: 1000, cashReceivedCents: 11000, cashAllocatedServiceWageCents: 6000,
  cashAcquiredServiceWageCents: 6000, cashWageShortfallCents: 0, cashRetainedCents: 7000,
  cashToSubmitToStoreCents: 4000, status, note: "测试备注", settledBy: "manager",
  settledByDisplayName: "测试经理", settledAt: "2026-01-01T15:00:00.000Z", version: 1, settlementId: "cash-id",
});
function render(cashRows: CashSettlementRow[] | null, employees = [employee("first"), employee("second")], cashLoadFailed = false) {
  return renderToStaticMarkup(createElement(ClosingEmployeeTable, {
    employees, cashRows, busy: false, cashLoadFailed,
    onReloadCash() {}, onSettleAll() {}, onToggleCash() {},
  }));
}

describe("合并员工日结与现金", () => {
  it("按员工 ID 匹配现金金额，保留两种状态与展开明细", () => {
    const markup = render([cashRow("second", "SETTLED"), { ...cashRow("first"), cashToSubmitToStoreCents: 1234 }]);
    const rows = markup.split("<tbody>")[1]!.split("</tr>");
    expect(rows[0]).toContain("US$12");
    expect(rows[0]).toContain("标记全部结清");
    expect(rows[1]).toContain("US$40");
    expect(rows[1]).toContain("取消结清");
    expect(markup).not.toContain("US$4,444"); // Do not substitute the personal closing cash formula.
    expect(markup).toContain("<details");
    expect(markup).toContain("测试经理");
    expect(markup).toContain("测试备注");
    expect(markup).not.toMatch(/disabled=""[^>]*>一键全部结清/);
  });

  it("现金加载失败显示重试，金额留空并禁用结清操作", () => {
    const markup = render(null, [employee("first")], true);
    expect(markup).toContain("重新加载现金");
    expect(markup).toMatch(/disabled=""[^>]*>一键全部结清/);
    expect(markup).toMatch(/disabled=""[^>]*>标记全部结清/);
    expect(markup).toContain("现金未结清不影响正常日结");
  });

  it("全部结清或没有员工时禁用批量结清", () => {
    expect(render([cashRow("first", "SETTLED")])).toMatch(/disabled=""[^>]*>一键全部结清/);
    const empty = render([], []);
    expect(empty).toMatch(/disabled=""[^>]*>一键全部结清/);
    expect(empty).toContain("当日没有记工");
  });

  it("现金数据没有对应员工时保持空值并禁止该行操作", () => {
    const markup = render([cashRow("second")], [employee("first")]);
    expect(markup).not.toContain("US$40");
    expect(markup).toMatch(/disabled=""[^>]*>标记全部结清/);
  });

  it("个人现金明细没有任何写入操作", () => {
    const markup = renderToStaticMarkup(createElement(CashSettlementDetails, { row: cashRow("first") }));
    expect(markup).toContain("工资缺口");
    expect(markup).not.toContain("<button");
  });
});
