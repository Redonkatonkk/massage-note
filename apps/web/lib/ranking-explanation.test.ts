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
});
