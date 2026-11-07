import { describe, expect, it } from "vitest";
import type { RankingExplanation } from "@massage-note/contracts";
import { rankingOrderChanged, rankingReason } from "./ranking-explanation";

const snapshot: RankingExplanation = {
  schemaVersion: 1, generatedAt: "2026-09-21T12:00:00Z",
  entries: [
    { membershipId: "B", displayName: "B", employmentType: "FULL_TIME", lastPosition: 2, lastBusinessDate: "2026-09-20", generatedPosition: 1, ties: [] },
    { membershipId: "A", displayName: "A", employmentType: "FULL_TIME", lastPosition: 1, lastBusinessDate: "2026-09-20", generatedPosition: 2, ties: [] },
  ],
};
describe("ranking explanation presentation", () => {
  it("detects reordered, hidden, removed and newly added employees without changing saved facts", () => {
    expect(rankingOrderChanged(snapshot, ["B", "A"])).toBe(false);
    expect(rankingOrderChanged(snapshot, ["A", "B"])).toBe(true);
    expect(rankingOrderChanged(snapshot, ["B"])).toBe(true);
    expect(rankingOrderChanged(snapshot, ["B", "A", "C"])).toBe(true);
    expect(snapshot.entries[0]?.generatedPosition).toBe(1);
  });
  it("explains historical first and forward rotation in Chinese and English", () => {
    expect(rankingReason(snapshot.entries[0]!, snapshot).join(" ")).toContain("目标为第 1");
    expect(rankingReason(snapshot.entries[1]!, snapshot).join(" ")).toContain("末尾组");
    expect(rankingReason(snapshot.entries[1]!, snapshot, true).join(" ")).toContain("Previously first");
  });
  it("explains first return from leave in both languages using the saved date", () => {
    const returned: RankingExplanation = { ...snapshot, schemaVersion: 2, fullTimeOrder: ["A", "B"], entries: [{ ...snapshot.entries[0]!, fullTimePosition: 2, leaveStartDate: "2026-11-02" }] };
    const entry = returned.entries[0]!;
    expect(rankingReason(entry, returned).join(" ")).toContain("自 2026-11-02 请假后首次返岗");
    expect(rankingReason(entry, returned).join(" ")).toContain("包括休息人员之后");
    expect(rankingReason(entry, returned, true).join(" ")).toContain("Returning from leave starting 2026-11-02");
    expect(rankingReason({ ...entry, leaveStartDate: undefined }, returned).join(" ")).not.toContain("请假");
    expect(rankingReason({ ...entry, lastPosition: null }, returned).join(" ")).toContain("首次返岗");
  });
  it("explains version three full-time and part-time heads, manual order and initial fallback", () => {
    const current: RankingExplanation = { ...snapshot, schemaVersion: 3, entries: [{ ...snapshot.entries[0]!, fullTimePosition: 2 }], fullTimeRotation: { rule: "PART_TIME_HEAD", referenceHead: { membershipId: "K", displayName: "K", employmentType: "PART_TIME", businessDate: "2027-02-01" }, movedMembershipIds: [] } };
    expect(rankingReason(current.entries[0]!, current).join(" ")).toContain("兼职 K 打头，全职队列不轮转");
    expect(rankingReason(current.entries[0]!, current, true).join(" ")).toContain("full-time queue keeps its turn");
    current.fullTimeRotation = { rule: "FULL_TIME_HEAD", referenceHead: { membershipId: "B", displayName: "B", employmentType: "FULL_TIME", businessDate: "2027-02-01" }, movedMembershipIds: ["A", "B"] };
    expect(rankingReason(current.entries[0]!, current).join(" ")).toContain("2 人一起轮到末尾");
    expect(rankingReason({ ...current.entries[0]!, leaveStartDate: "2027-01-30" }, current, true).join(" ")).toContain("final-tail priority");
    current.fullTimeRotation = { rule: "MANUAL_ORDER", movedMembershipIds: [] };
    expect(rankingReason(current.entries[0]!, current).join(" ")).toContain("采用当日保存的人工全职顺序");
    current.fullTimeRotation = { rule: "LEGACY_ONE_STEP", movedMembershipIds: ["A"] };
    expect(rankingReason(current.entries[0]!, current, true).join(" ")).toContain("existing one-step");
  });
  it("explains the full-time newcomer exception without misdescribing part-time placement", () => {
    const current: RankingExplanation = { ...snapshot, schemaVersion: 3, fullTimeRotation: { rule: "FULL_TIME_HEAD", referenceHead: { membershipId: "B", displayName: "B", employmentType: "FULL_TIME", businessDate: "2027-02-01" }, movedMembershipIds: ["B"] }, entries: [
      { ...snapshot.entries[0]!, membershipId: "N", displayName: "N", lastPosition: null, generatedPosition: 1 },
      { ...snapshot.entries[0]!, membershipId: "P", displayName: "P", employmentType: "PART_TIME", lastPosition: 1, generatedPosition: 2 },
      { ...snapshot.entries[0]!, generatedPosition: 3 },
    ] };
    expect(rankingReason(current.entries[0]!, current).join(" ")).toContain("因此排在该人员之前");
    expect(rankingReason(current.entries[0]!, current, true).join(" ")).toContain("ahead of the previous full-time head");
    expect(rankingReason(current.entries[1]!, current).join(" ")).toContain("只调整全职之间的顺序");
  });
});
