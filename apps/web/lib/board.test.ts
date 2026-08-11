import { describe, expect, it } from "vitest";
import { deduplicateMembershipRows, discountBadgeText } from "./board";

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
});
