import { describe, expect, it } from "vitest";
import {
  canShowEmployeeClockIn,
  canViewEmployeeTotals,
  compactPaymentAmount,
  deduplicateMembershipRows,
  discountBadgeText,
  recordPaymentDisplay,
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

  it("把刷卡金额排在现金金额前，供卡片显示为框线金额加普通金额", () => {
    expect(recordPaymentDisplay({
      status: "CONFIRMED",
      cashCents: 5_000,
      cardCents: 3_000,
      giftCardCents: 0,
    })).toEqual({
      kind: "PAID",
      parts: [
        { method: "CARD", cents: 3_000 },
        { method: "CASH", cents: 5_000 },
      ],
    });
  });

  it("区分纯现金、纯刷卡、礼物卡、零金额和待结账付款", () => {
    expect(recordPaymentDisplay({ status: "CONFIRMED", cashCents: 5_000, cardCents: 0, giftCardCents: 0 }))
      .toEqual({ kind: "PAID", parts: [{ method: "CASH", cents: 5_000 }] });
    expect(recordPaymentDisplay({ status: "CONFIRMED", cashCents: 0, cardCents: 3_000, giftCardCents: 0 }))
      .toEqual({ kind: "PAID", parts: [{ method: "CARD", cents: 3_000 }] });
    expect(recordPaymentDisplay({ status: "CONFIRMED", cashCents: 0, cardCents: 0, giftCardCents: 2_000 }))
      .toEqual({ kind: "PAID", parts: [{ method: "GIFT_CARD", cents: 2_000 }] });
    expect(recordPaymentDisplay({ status: "CONFIRMED", cashCents: 0, cardCents: 0, giftCardCents: 0 }))
      .toEqual({ kind: "ZERO", parts: [] });
    expect(recordPaymentDisplay({ status: "PENDING_PAYMENT", cashCents: null, cardCents: null, giftCardCents: null }))
      .toEqual({ kind: "PENDING", parts: [] });
  });

  it("付款金额整数不显示小数，非整数保留精确的两位美分", () => {
    expect(compactPaymentAmount(3_000)).toBe("30");
    expect(compactPaymentAmount(3_050)).toBe("30.50");
    expect(compactPaymentAmount(3_005)).toBe("30.05");
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
