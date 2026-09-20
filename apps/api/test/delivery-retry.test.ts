import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClosingDeliveriesService } from "../src/finance/closing-deliveries.service.js";
import { EmployeeSettlementsService } from "../src/finance/employee-settlements.service.js";
import type { PrismaService } from "../src/database/prisma.service.js";

  const token = ["mna", "deadbeef01", "retry"].join("_");
afterEach(() => vi.useRealTimers());

for (const Service of [ClosingDeliveriesService, EmployeeSettlementsService]) {
  describe(`${Service.name} retry limits`, () => {
    it.each([1, 2, 3, 4, 5])("attempt %i permits only three additional retries with a fixed 60 second delay", async attemptCount => {
      vi.useFakeTimers();
      const now = new Date("2026-09-19T12:00:00Z");
      vi.setSystemTime(now);
      const updateMany = vi.fn().mockResolvedValue({ count: 1 });
      const delivery = {
        findFirst: vi.fn().mockResolvedValue({ id: "job", storeId: "store", attemptCount }),
        updateMany,
      };
      const prisma = {
        closingDeliveryAgent: { findUnique: vi.fn().mockResolvedValue({
          storeId: "store", tokenHash: createHash("sha256").update(token).digest("hex"),
          store: { status: "ACTIVE", deletedAt: null }, revokedAt: null,
        }) },
        employeeClosingDelivery: delivery, employeeSettlementDelivery: delivery,
      } as unknown as PrismaService;
      const service = new Service(prisma, {} as never, {} as never);
      const retry = attemptCount <= 3;
      const input = { leaseToken: "lease", code: "PRE_SEND_FAILURE", message: "failed", retryable: true };
      expect(await service.fail(`Bearer ${token}`, "job", input)).toEqual({ retryScheduled: retry });
      expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({
        status: retry ? "QUEUED" : "FAILED", leaseToken: null, leaseExpiresAt: null,
        nextAttemptAt: new Date(now.getTime() + (retry ? 60_000 : 0)),
      }) }));
      // Ambiguous results must not enter the retry queue, even below the limit.
      expect(await service.fail(`Bearer ${token}`, "job", { ...input, retryable: false })).toEqual({ retryScheduled: false });
      expect(updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "FAILED" }) }));
    });
  });
}
