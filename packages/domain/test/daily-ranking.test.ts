import { describe, expect, it } from "vitest";
import { rankRotationCandidates, explainRotationCandidates } from "../src/daily-ranking.js";

const candidate = (
  membershipId: string,
  lastPosition: number | null,
  employmentType: "FULL_TIME" | "PART_TIME" = "PART_TIME",
  lastBusinessDate = "2026-09-03",
) => ({ membershipId, lastPosition, employmentType, lastBusinessDate });

describe("daily opening ranking", () => {
  it("rotates a complete A B C D list to B C D A", () => {
    expect(rankRotationCandidates([
      candidate("A", 1), candidate("B", 2), candidate("C", 3), candidate("D", 4),
    ])).toEqual(["B", "C", "D", "A"]);
  });

  it("uses full-time and recent attendance as tie breakers", () => {
    expect(rankRotationCandidates([
      candidate("part", 2, "PART_TIME", "2026-09-03"),
      candidate("full", 2, "FULL_TIME", "2026-08-30"),
    ])).toEqual(["full", "part"]);
    expect(rankRotationCandidates([
      candidate("older", 2, "PART_TIME", "2026-08-30"),
      candidate("recent", 2, "PART_TIME", "2026-09-03"),
    ])).toEqual(["recent", "older"]);
  });

  it("puts members without history after members rotating from first", () => {
    expect(rankRotationCandidates([
      candidate("new", null), candidate("former-first", 1),
    ])).toEqual(["former-first", "new"]);
  });

  it("compresses positions when the number of employees changes", () => {
    expect(rankRotationCandidates([
      candidate("A", 1), candidate("C", 3), candidate("D", 4),
    ])).toEqual(["C", "D", "A"]);
  });

  it.each([null, 1, 2])("ignores arrival time and input order for tied position %s", (position) => {
    const employees = [
      { ...candidate("A", position), addedAt: "2026-09-04T09:01:00Z" },
      { ...candidate("B", position), addedAt: "2026-09-04T09:00:00Z" },
    ];
    expect(rankRotationCandidates(employees)).toEqual(["A", "B"]);
    expect(rankRotationCandidates([...employees].reverse())).toEqual(["A", "B"]);
    expect(rankRotationCandidates(employees.map((employee, index) => ({
      ...employee, addedAt: employees[1 - index]!.addedAt,
    })))).toEqual(["A", "B"]);
  });
});

describe("ranking explanations", () => {
  it("explains ABC → BC → CBA using each person's own most recent attendance", () => {
    const secondDay = rankRotationCandidates([candidate("B", 2, "FULL_TIME"), candidate("C", 3)]);
    expect(secondDay).toEqual(["B", "C"]);
    const result = explainRotationCandidates([
      candidate("A", 1, "FULL_TIME", "2026-09-01"),
      candidate("B", 1, "FULL_TIME", "2026-09-02"),
      candidate("C", 2, "PART_TIME", "2026-09-02"),
    ]);
    expect(result.map((entry) => entry.membershipId)).toEqual(["C", "B", "A"]);
    expect(result[0]?.ties).toEqual([]);
    expect(result[1]?.ties).toEqual([{ membershipId: "A", ahead: true, rule: "RECENT_ATTENDANCE" }]);
    expect(result[2]?.ties).toEqual([{ membershipId: "B", ahead: false, rule: "RECENT_ATTENDANCE" }]);
  });
  it("explains employment priority and exact ties among newcomers", () => {
    const result = explainRotationCandidates([
      candidate("C", null, "PART_TIME"), candidate("B", null, "FULL_TIME"), candidate("A", null, "FULL_TIME"),
    ]);
    expect(result.map((entry) => entry.membershipId)).toEqual(["A", "B", "C"]);
    expect(result[0]?.ties).toEqual([
      { membershipId: "B", ahead: true, rule: "STABLE_ID" },
      { membershipId: "C", ahead: true, rule: "EMPLOYMENT_TYPE" },
    ]);
  });
});
