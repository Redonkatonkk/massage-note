import { describe, expect, it, vi } from "vitest";
import { ClosingSchedulerService, scheduledClosingDate } from "../src/finance/closing-scheduler.service.js";
import type { PrismaService } from "../src/database/prisma.service.js";
import type { ClosingsService } from "../src/finance/closings.service.js";

describe("23:30 automatic closing", () => {
  it("uses each store's local date, including summer and winter time", () => {
    expect(scheduledClosingDate(new Date("2026-09-18T03:30:00Z"), "America/New_York")).toBe("2026-09-17");
    expect(scheduledClosingDate(new Date("2026-01-18T04:30:59Z"), "America/New_York")).toBe("2026-01-17");
    expect(scheduledClosingDate(new Date("2026-09-18T03:29:59Z"), "America/New_York")).toBeNull();
    expect(scheduledClosingDate(new Date("2026-09-18T03:31:00Z"), "America/New_York")).toBeNull();
    expect(scheduledClosingDate(new Date("2026-09-18T03:30:00Z"), "America/Los_Angeles")).toBeNull();
  });
  it("isolates store errors and skips inactive owners and other timezones", async () => {
    const user = { id: "owner", status: "ACTIVE" };
    const store = { timezone: "America/New_York", ownerMembership: { status: "ACTIVE", deletedAt: null, user } };
    const findMany = vi.fn().mockResolvedValue([
      { ...store, id: "broken", timezone: "invalid" },
      { ...store, id: "eligible" },
      { ...store, id: "west", timezone: "America/Los_Angeles" },
      { ...store, id: "inactive", ownerMembership: null },
    ]);
    const close = vi.fn().mockResolvedValue({});
    const scheduler = new ClosingSchedulerService({ store: { findMany } } as unknown as PrismaService, { close } as unknown as ClosingsService);
    await scheduler.tick(new Date("2026-09-18T03:30:00Z"));
    expect(close).toHaveBeenCalledExactlyOnceWith(user, "eligible", "2026-09-17", { force: false }, "automatic-closing:2026-09-17", "automatic-closing:eligible:2026-09-17", true);
  });
});
