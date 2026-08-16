import { describe, expect, it } from "vitest";
import {
  canShowEmployeeClockIn,
  canViewEmployeeTotals,
  deduplicateMembershipRows,
  discountBadgeText,
} from "./board";

describe("今日表格行整理", () => {
  it("实时刷新异常返回重复成员时只保留第一行并保持顺序", () => {
    expect(deduplicateMembershipRows([
      { id: "row-1", membershipId: "member-1" },
      { id: "row-2", membershipId: "member-2" },
      { id: "row-3", membershipId: "member-1" },
    ])).toEqual([
      { id: "row-1", membershipId: "member-1" },
      { id: "row-2", membershipId: "member-2" },
    ]);
  });

  it("把今日卡片折扣金额压缩为不带货币符号的 off 标签", () => {
    expect(discountBadgeText(500)).toBe("off5");
    expect(discountBadgeText(1_000)).toBe("off10");
    expect(discountBadgeText(550)).toBe("off5.5");
    expect(discountBadgeText(505)).toBe("off5.05");
  });

  it("只让尚未加入当天表格的记工员工看到上班入口", () => {
    const eligible = {
      role: "EMPLOYEE" as const,
      isServiceProvider: true,
      isCurrentBusinessDay: true,
      isClosed: false,
      hasOwnRow: false,
    };

    expect(canShowEmployeeClockIn(eligible)).toBe(true);
    expect(canShowEmployeeClockIn({ ...eligible, role: "MANAGER" })).toBe(false);
    expect(canShowEmployeeClockIn({ ...eligible, isServiceProvider: false })).toBe(false);
    expect(canShowEmployeeClockIn({ ...eligible, isCurrentBusinessDay: false })).toBe(false);
    expect(canShowEmployeeClockIn({ ...eligible, isClosed: true })).toBe(false);
    expect(canShowEmployeeClockIn({ ...eligible, hasOwnRow: true })).toBe(false);
  });

  it("员工只能看到自己的行小结，店长和经理可以看到所有行小结", () => {
    const rowMembershipId = "employee-2";

    expect(canViewEmployeeTotals({ role: "OWNER", viewerMembershipId: "owner", rowMembershipId })).toBe(true);
    expect(canViewEmployeeTotals({ role: "MANAGER", viewerMembershipId: "manager", rowMembershipId })).toBe(true);
    expect(canViewEmployeeTotals({ role: "EMPLOYEE", viewerMembershipId: rowMembershipId, rowMembershipId })).toBe(true);
    expect(canViewEmployeeTotals({ role: "EMPLOYEE", viewerMembershipId: "employee-1", rowMembershipId })).toBe(false);
  });
});
