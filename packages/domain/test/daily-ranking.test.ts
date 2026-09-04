import { describe, expect, it } from "vitest";
import { rankRotationCandidates } from "../src/daily-ranking.js";

const candidate = (
  membershipId: string,
  lastPosition: number | null,
  employmentType: "FULL_TIME" | "PART_TIME" = "PART_TIME",
  lastBusinessDate = "2026-09-03",
) => ({ membershipId, lastPosition, employmentType, lastBusinessDate, addedAt: membershipId });

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

  it("uses stable arrival and membership ordering for new employees", () => {
    expect(rankRotationCandidates([
      { ...candidate("later", null), addedAt: "2026-09-04T09:01:00Z" },
      { ...candidate("earlier", null), addedAt: "2026-09-04T09:00:00Z" },
    ])).toEqual(["earlier", "later"]);
  });
});
