import { describe, expect, it } from "vitest";
import { automaticRecordEnd, recordTimeAfterDuration, recordTimeError, sameDayRecordTimeAfterDuration } from "./record-time";

describe("record service date", () => {
  it("retains optional end time and checks restored cross-date drafts", () => {
    expect(recordTimeError("2026-09-10T12:00", "")).toBeNull();
    expect(recordTimeError("2026-09-10T12:00", "2026-09-10T13:00")).toBeNull();
    expect(recordTimeError("2026-09-10T12:00", "2026-09-11T13:00")).not.toBeNull();
  });
});

describe("automatic record end", () => {
  it("fills a missing end from service and addon duration", () => {
    const end = automaticRecordEnd("2026-09-12T11:30", "", 75, "America/New_York");
    expect(end).toBe("2026-09-12T12:45");
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
    expect(end).toBe("2026-09-12T00:30");
    expect(recordTimeError(start, end)).not.toBeNull();
  });
  it("calculates from the reference time each time instead of accumulating duration changes", () => {
    const start = "2026-09-12T17:10";
    expect(recordTimeAfterDuration(start, 90, "America/New_York")).toBe("2026-09-12T18:40");
    expect(recordTimeAfterDuration(start, 60, "America/New_York")).toBe("2026-09-12T18:10");
    expect(recordTimeAfterDuration("2026-09-12T18:40", -90, "America/New_York")).toBe(start);
  });
  it("recalculates the end when an add-on duration is entered or cleared", () => {
    const start = "2026-09-12T11:30";
    expect(recordTimeAfterDuration(start, 90, "America/New_York")).toBe("2026-09-12T13:00");
    expect(recordTimeAfterDuration(start, 60, "America/New_York")).toBe("2026-09-12T12:30");
  });
});

describe("clock edits keep the selected service date", () => {
  it("does not move to yesterday when changing an end time from PM to AM", () => {
    const start = sameDayRecordTimeAfterDuration("2026-09-13T00:45", -60, "America/New_York");
    expect(start).toBe("2026-09-13T23:45");
    expect(recordTimeError(start, "2026-09-13T00:45")).not.toBeNull();
    expect(sameDayRecordTimeAfterDuration("2026-09-13T12:45", -60, "America/New_York")).toBe("2026-09-13T11:45");
  });
  it("does not move to tomorrow when changing a start time from AM to PM", () => {
    expect(sameDayRecordTimeAfterDuration("2026-09-13T23:45", 60, "America/New_York")).toBe("2026-09-13T00:45");
    expect(sameDayRecordTimeAfterDuration("2026-09-13T11:45", 60, "America/New_York")).toBe("2026-09-13T12:45");
  });
  it("keeps the explicitly chosen date when service or addon duration crosses midnight", () => {
    expect(sameDayRecordTimeAfterDuration("2026-09-14T23:00", 90, "America/New_York")).toBe("2026-09-14T00:30");
  });
});
