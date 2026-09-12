import { describe, expect, it } from "vitest";
import { adjustedSameDayEnd, automaticRecordEnd, recordTimeError } from "./record-time";

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

describe("automatic record end", () => {
  it("fills a missing end from service and addon duration and follows start edits", () => {
    const end = automaticRecordEnd("2026-09-12T11:30", "", 75, "America/New_York");
    expect(end).toBe("2026-09-12T12:45");
    expect(adjustedSameDayEnd("2026-09-12T11:30", end, "2026-09-12T13:00", 0, "America/New_York")).toBe("2026-09-12T14:15");
  });
  it("allows combined service and addon duration beyond a single item limit", () => {
    expect(automaticRecordEnd("2026-09-12T01:00", "", 750, "America/New_York")).toBe("2026-09-12T13:30");
  });
  it("preserves existing actual end times", () => {
    expect(automaticRecordEnd("2026-09-12T11:30", "2026-09-12T13:00", 60, "America/New_York")).toBe("2026-09-12T13:00");
  });
  it("keeps a computed overnight end visible to same-day validation", () => {
    const start = "2026-09-12T23:30";
    const end = automaticRecordEnd(start, "", 60, "America/New_York");
    expect(end).toBe("2026-09-13T00:30");
    expect(recordTimeError(start, end)).not.toBeNull();
  });
});
