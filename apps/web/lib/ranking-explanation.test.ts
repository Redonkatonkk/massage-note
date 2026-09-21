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
});
