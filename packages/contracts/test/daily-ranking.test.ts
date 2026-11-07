import { describe, expect, it } from "vitest";
import { updateWeeklyDispatchSchema, rankingExplanationSchema } from "../src/board.js";
const id = "00000000-0000-4000-8000-000000000001";
const schedule = { monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] };
describe("dated full-time settings contracts", () => {
  it("accepts legacy weekly saves and atomic dated settings", () => {
    expect(updateWeeklyDispatchSchema.safeParse({ version: 1, schedule }).success).toBe(true);
    expect(updateWeeklyDispatchSchema.safeParse({ version: 1, schedule, businessDate: "2026-11-02", boardVersion: 0, fullTimeOrder: [id] }).success).toBe(true);
  });
  it("rejects partial dated submissions and duplicate members", () => {
    expect(updateWeeklyDispatchSchema.safeParse({ version: 1, schedule, businessDate: "2026-11-02" }).success).toBe(false);
    expect(updateWeeklyDispatchSchema.safeParse({ version: 1, schedule, businessDate: "2026-11-02", boardVersion: 0, fullTimeOrder: [id, id] }).success).toBe(false);
  });
  it("reads old snapshots and complete version two explanations", () => {
    expect(rankingExplanationSchema.safeParse({ schemaVersion: 1, generatedAt: "2026-11-02", entries: [] }).success).toBe(true);
    expect(rankingExplanationSchema.safeParse({ schemaVersion: 2, generatedAt: "2026-11-02", fullTimeOrder: [id], entries: [{ membershipId: id, displayName: "A", employmentType: "FULL_TIME", lastPosition: 1, lastBusinessDate: "2026-11-01", generatedPosition: 1, fullTimePosition: 1, targetPosition: null, ties: [] }] }).success).toBe(true);
  });
  it("preserves the optional leave date and rejects invalid dates", () => {
    const snapshot = { schemaVersion: 2, generatedAt: "2026-11-05", entries: [{ membershipId: id, displayName: "A", employmentType: "FULL_TIME", lastPosition: 1, lastBusinessDate: "2026-11-01", generatedPosition: 3, fullTimePosition: 3, ties: [], leaveStartDate: "2026-11-02" }] };
    expect(rankingExplanationSchema.parse(snapshot).entries[0]?.leaveStartDate).toBe("2026-11-02");
    expect(rankingExplanationSchema.safeParse({ ...snapshot, entries: [{ ...snapshot.entries[0], leaveStartDate: "yesterday" }] }).success).toBe(false);
  });
  it("preserves version three rotation references and rejects invalid reference types", () => {
    const snapshot = { schemaVersion: 3, generatedAt: "2027-02-02", fullTimeOrder: [id], entries: [], fullTimeRotation: { rule: "PART_TIME_HEAD", referenceHead: { membershipId: id, displayName: "K", employmentType: "PART_TIME", businessDate: "2027-02-01" }, movedMembershipIds: [] } };
    expect(rankingExplanationSchema.parse(snapshot).fullTimeRotation).toEqual(snapshot.fullTimeRotation);
    expect(rankingExplanationSchema.safeParse({ ...snapshot, fullTimeRotation: { ...snapshot.fullTimeRotation, referenceHead: { ...snapshot.fullTimeRotation.referenceHead, employmentType: "UNKNOWN" } } }).success).toBe(false);
  });
});
