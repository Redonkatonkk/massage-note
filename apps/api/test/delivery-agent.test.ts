import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { ClosingDeliveriesService } from "../src/finance/closing-deliveries.service.js";
import { EmployeeSettlementsService } from "../src/finance/employee-settlements.service.js";

const token = "mna_deadbeef01_test-secret";
const agent = {
  id: "agent",
  storeId: "store",
  revokedAt: null,
  tokenHash: createHash("sha256").update(token).digest("hex"),
  store: { status: "ACTIVE", deletedAt: null },
};
const failure = { leaseToken: "lease", code: "TEST", message: "test", retryable: false };

for (const Service of [ClosingDeliveriesService, EmployeeSettlementsService]) {
  describe(`${Service.name} agent authentication`, () => {
    function setup(value: unknown = agent) {
      const findUnique = vi.fn().mockResolvedValue(value);
      const findFirst = vi.fn().mockResolvedValue({ id: "job", attemptCount: 1 });
      const updateMany = vi.fn().mockResolvedValue({ count: 1 });
      const delivery = { findFirst, updateMany };
      const prisma = {
        closingDeliveryAgent: { findUnique },
        employeeClosingDelivery: delivery,
        employeeSettlementDelivery: delivery,
      };
      return {
        service: new Service(prisma as never, {} as never, {} as never),
        findUnique, findFirst, updateMany,
      };
    }

    it.each([undefined, "", "Basic test", "Bearer invalid", "Bearer mna_invalid_test"])(
      "rejects malformed credentials %s before reading deliveries",
      async authorization => {
        const { service, findUnique, findFirst, updateMany } = setup();
        await expect(service.fail(authorization, "job", failure)).rejects.toMatchObject({
          response: { code: "DELIVERY_AGENT_TOKEN_REQUIRED" },
        });
        expect(findUnique).not.toHaveBeenCalled();
        expect(findFirst).not.toHaveBeenCalled();
        expect(updateMany).not.toHaveBeenCalled();
      },
    );

    it.each([
      ["missing agent", null],
      ["revoked agent", { ...agent, revokedAt: new Date() }],
      ["inactive store", { ...agent, store: { ...agent.store, status: "INACTIVE" } }],
      ["deleted store", { ...agent, store: { ...agent.store, deletedAt: new Date() } }],
      ["different secret", { ...agent, tokenHash: "0".repeat(64) }],
      ["invalid hash length", { ...agent, tokenHash: "short" }],
    ])("rejects %s before reading deliveries", async (_label, value) => {
      const { service, findFirst, updateMany } = setup(value);
      await expect(service.fail(`Bearer ${token}`, "job", failure)).rejects.toMatchObject({
        response: { code: "DELIVERY_AGENT_TOKEN_INVALID" },
      });
      expect(findFirst).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
    });

    it("accepts a valid agent and restricts the delivery to its store", async () => {
      const { service, findUnique, findFirst } = setup();
      await expect(service.fail(`bearer ${token}`, "job", failure)).resolves.toEqual({ retryScheduled: false });
      expect(findUnique).toHaveBeenCalledWith({
        where: { tokenPrefix: "deadbeef01" },
        include: { store: { select: { status: true, deletedAt: true } } },
      });
      expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({ id: "job", storeId: "store", leaseToken: "lease" }),
      }));
    });
  });
}
