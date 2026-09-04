import { describe, expect, it } from "vitest";
import {
  initialProcessedTurnsForLateArrival,
  rankRotationCandidates,
  sortNormalTurnCandidates,
} from "../src/dispatch.js";

const candidate = (
  membershipId: string,
  lastPosition: number | null,
  employmentType: "FULL_TIME" | "PART_TIME" = "PART_TIME",
  lastBusinessDate = "2026-09-03",
) => ({ membershipId, lastPosition, employmentType, lastBusinessDate, addedAt: membershipId });

describe("dispatch rotation", () => {
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

  it("orders normal turns by processed count and official position", () => {
    expect(sortNormalTurnCandidates([
      { membershipId: "B", normalTurnsProcessed: 0, position: 2 },
      { membershipId: "A", normalTurnsProcessed: 1, position: 1 },
      { membershipId: "C", normalTurnsProcessed: 0, position: 3 },
    ]).map((item) => item.membershipId)).toEqual(["B", "C", "A"]);
  });

  it("crosses a late arrival only when its slot has already passed", () => {
    expect(initialProcessedTurnsForLateArrival({ nextNormalPosition: 3, newPosition: 2, minimumProcessedTurns: 1 })).toBe(2);
    expect(initialProcessedTurnsForLateArrival({ nextNormalPosition: 3, newPosition: 4, minimumProcessedTurns: 1 })).toBe(1);
  });
});
