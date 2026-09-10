import { describe, expect, it } from "vitest";
import { adjustedSameDayEnd, recordTimeError } from "./record-time";

describe("record service date", () => {
  it("moves both times together when the date changes", () => {
    expect(adjustedSameDayEnd("2026-09-10T12:09", "2026-09-10T13:09", "2026-09-11T12:09", 0, "America/New_York")).toBe("2026-09-11T13:09");
  });
  it("does not silently save an overnight duration", () => {
    const end = adjustedSameDayEnd("2026-09-10T22:00", "2026-09-10T23:00", "2026-09-10T23:30", 0, "America/New_York");
    expect(end).toBe("2026-09-10T00:30");
    expect(recordTimeError("2026-09-10T23:30", end)).not.toBeNull();
  });
  it("retains optional end time and checks restored cross-date drafts", () => {
    expect(recordTimeError("2026-09-10T12:00", "")).toBeNull();
    expect(recordTimeError("2026-09-10T12:00", "2026-09-10T13:00")).toBeNull();
    expect(recordTimeError("2026-09-10T12:00", "2026-09-11T13:00")).not.toBeNull();
  });
});
