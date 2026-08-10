import { describe, expect, it } from "vitest";
import { deduplicateMembershipRows } from "./board";

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
});
