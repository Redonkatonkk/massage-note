import { describe, expect, it } from "vitest";
import { rankRotationCandidates, explainRotationCandidates, rotateFullTimeOrder, resolveFullTimeLeaveReturns, moveFullTimeLeaveReturnersToTail } from "../src/daily-ranking.js";
const candidate = (membershipId: string, lastPosition: number | null, employmentType: "FULL_TIME" | "PART_TIME" = "PART_TIME", lastBusinessDate = "2026-09-03") => ({ membershipId, lastPosition, employmentType, lastBusinessDate });
describe("independent daily rotation", () => {
  it("reserves part-time second before filling full-time gaps", () => {
    expect(rankRotationCandidates([candidate("P", 3), ...["A", "B", "C"].map(id => candidate(id, 1, "FULL_TIME"))], ["B", "C", "A"])).toEqual(["B", "P", "C", "A"]);
  });
  it("orders tied part-time targets by earlier attendance and shifts later targets", () => {
    expect(rankRotationCandidates([candidate("B", 2), candidate("A", 2, "PART_TIME", "2026-09-01"), candidate("C", 3), candidate("F", 1, "FULL_TIME")], ["F"])).toEqual(["A", "B", "C", "F"]);
  });
  it("compresses overflowing targets while reserving returning-first and newcomer tails", () => {
    expect(rankRotationCandidates([candidate("A", 6), candidate("B", 7), candidate("C", 1), candidate("N", null), candidate("F", 1, "FULL_TIME")], ["F"])).toEqual(["F", "A", "B", "C", "N"]);
  });
  it("keeps resting full-time staff in the complete queue", () => {
    const day2 = rotateFullTimeOrder(["A", "B", "C"]);
    expect(day2).toEqual(["B", "C", "A"]);
    expect(rankRotationCandidates([candidate("A", 1, "FULL_TIME"), candidate("C", 3, "FULL_TIME")], day2)).toEqual(["C", "A"]);
    expect(rotateFullTimeOrder(day2)).toEqual(["C", "A", "B"]);
  });
  it("places all newcomers last while respecting full-time internal order", () => {
    expect(rankRotationCandidates([candidate("P", 1), candidate("A", null, "FULL_TIME"), candidate("B", null, "FULL_TIME"), candidate("N", null)], ["B", "A"])).toEqual(["P", "B", "A", "N"]);
  });
  it("explains targets and earlier attendance with the generated sequence", () => {
    const result = explainRotationCandidates([candidate("A", 2, "PART_TIME", "2026-09-01"), candidate("B", 2)]);
    expect(result[0]).toMatchObject({ membershipId: "A", generatedPosition: 1, targetPosition: 1, ties: [{ membershipId: "B", ahead: true, rule: "EARLIER_ATTENDANCE" }] });
  });
  it("moves simultaneous leave returners behind resting staff in rotated relative order", () => {
    const order = rotateFullTimeOrder(["A", "B", "C", "REST"]);
    const returned = moveFullTimeLeaveReturnersToTail(order, new Set(["A", "B"]));
    expect(returned).toEqual(["C", "REST", "B", "A"]);
    expect(order).toEqual(["B", "C", "REST", "A"]);
    expect(rotateFullTimeOrder(returned)).toEqual(["REST", "B", "A", "C"]);
  });
  it("resolves leave by business date, cancels same-day restoration and consumes each episode once", () => {
    expect(resolveFullTimeLeaveReturns([
      { businessDate: "2026-11-06", membershipIds: ["A", "B"] },
      { businessDate: "2026-11-02", membershipIds: ["B"] },
      { businessDate: "2026-11-03", membershipIds: [] },
      { businessDate: "2026-11-04", membershipIds: [] },
      { businessDate: "2026-11-05", membershipIds: ["A", "B"] },
      { businessDate: "2026-11-07", membershipIds: ["B"] },
      { businessDate: "2026-11-08", membershipIds: ["A", "B"] },
    ], [
      { businessDate: "2026-11-07", membershipId: "A" },
      { businessDate: "2026-11-03", membershipId: "A" },
      { businessDate: "2026-11-02", membershipId: "A" },
      { businessDate: "2026-11-02", membershipId: "B" },
    ])).toEqual([
      { membershipId: "A", businessDate: "2026-11-05", leaveStartDate: "2026-11-02" },
      { membershipId: "A", businessDate: "2026-11-08", leaveStartDate: "2026-11-07" },
    ]);
  });
  it("always returns every candidate exactly once across collisions and changing attendance", () => {
    for (let size = 1; size <= 20; size++) {
      const people = Array.from({ length: size }, (_, index) => candidate(String(index), index % 5 === 0 ? null : index % 7 + 1, index % 3 === 0 ? "FULL_TIME" : "PART_TIME"));
      const full = people.filter(person => person.employmentType === "FULL_TIME").map(person => person.membershipId);
      const result = rankRotationCandidates(people, full);
      expect(new Set(result).size).toBe(size);
      expect([...result].sort()).toEqual(people.map(person => person.membershipId).sort());
    }
  });
});
