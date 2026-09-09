import { describe, expect, it, vi } from "vitest";
import { businessTables, readBusinessData } from "../src/ai/business-reader.js";
import { AiService } from "../src/ai/ai.service.js";

const owner = { id: "member", role: "OWNER" };
const actor = { id: "user" };
describe("AI business reading", () => {
  it.each(businessTables)("scopes %s to the current store without today's restriction", async (table) => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { [table[0]!.toLowerCase() + table.slice(1)]: { findMany } };
    await readBusinessData(prisma as never, "store", owner, { table });
    const query = findMany.mock.calls[0]![0];
    expect(JSON.stringify(query.where)).toContain('"store"');
    expect(JSON.stringify(query.where)).not.toContain('businessDate');
    expect(query.take).toBe(101);
  });
  it("reports pagination and inclusive date ranges", async () => {
    const findMany = vi.fn().mockResolvedValue(Array.from({ length: 101 }, (_, id) => ({ id })));
    const result = await readBusinessData({ workRecord: { findMany } } as never, "store", owner, { table: "WorkRecord", dateFrom: "2026-08-26", dateTo: "2026-09-09", offset: 100 });
    expect(result).toMatchObject({ hasMore: true, nextOffset: 200 });
    expect(result.rows).toHaveLength(100);
    expect(findMany.mock.calls[0]![0].where.AND[0].businessDate).toEqual({ gte: new Date("2026-08-26T00:00:00Z"), lt: new Date("2026-09-10T00:00:00Z") });
  });
  it("rejects arbitrary tables, tenant overrides and invalid dates", async () => {
    for (const query of [{ table: "User" }, { table: "ClosingDeliveryAgent" }, { table: "WorkRecord", storeId: "other" }, { table: "WorkRecord", dateFrom: "2026-02-30" }]) {
      await expect(readBusinessData({} as never, "store", owner, query)).rejects.toThrow();
    }
  });
  it("keeps employee financial records scoped to self", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await readBusinessData({ payrollSettlement: { findMany } } as never, "store", { ...owner, role: "EMPLOYEE" }, { table: "PayrollSettlement" });
    expect(findMany.mock.calls[0]![0].where.AND[0]).toMatchObject({ storeId: "store", membershipId: "member" });
  });
  it("record IDs cannot override the store filter and contact fields stay private", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const id = "00000000-0000-4000-8000-000000000001";
    await readBusinessData({ storeMembership: { findMany } } as never, "store", owner, { table: "StoreMembership", id });
    expect(findMany.mock.calls[0]![0].where.AND).toEqual([{ storeId: "store", deletedAt: null }, { id }]);
    expect(findMany.mock.calls[0]![0].select.closingDeliveryPhoneE164).toBeUndefined();
  });
  it("snapshot queries inherit the employee and store scope", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    await readBusinessData({ paymentBreakdown: { findMany } } as never, "store", { ...owner, role: "EMPLOYEE" }, { table: "PaymentBreakdown" });
    expect(findMany.mock.calls[0]![0].where.AND[0]).toEqual({ workRecord: { storeId: "store", employeeMembershipId: "member" } });
  });
  it("work assistant queries 15 historical days even when today has no records", async () => {
    const empty = { findMany: vi.fn().mockResolvedValue([]) };
    const prisma = { store: { findFirst: vi.fn().mockResolvedValue({ timezone: "America/New_York", businessCutoffLocal: "22:00" }), findUniqueOrThrow: vi.fn().mockResolvedValue({ timezone: "America/New_York", businessCutoffLocal: "22:00" }) }, storeMembership: empty, serviceItem: empty, addonItem: empty, discountItem: empty, workRecord: empty, aiConversation: { create: vi.fn().mockResolvedValue({ id: "conversation" }) }, aiQueryLog: { create: vi.fn() } };
    const complete = vi.fn().mockResolvedValueOnce({ content: "", provider: "test", model: "test", toolCall: { name: "query_finance", arguments: { dateFrom: "2026-08-26", dateTo: "2026-09-09" } } }).mockResolvedValueOnce({ content: "过去15天折后大费 $123", provider: "test", model: "test" });
    const summary = vi.fn().mockResolvedValue({ totals: { discountedFeePerformanceCents: 12300n }, days: [] });
    const ai = new AiService(prisma as never, { requireActiveMembership: vi.fn().mockResolvedValue(owner) } as never, { summary } as never, {} as never, {} as never, { isConfigured: () => true, complete } as never, {} as never);
    const result = await ai.workMessage(actor as never, "store", { text: "给我过去15天的折后大费" });
    expect(summary).toHaveBeenCalledWith(actor, "store", expect.objectContaining({ dateFrom: "2026-08-26", dateTo: "2026-09-09" }));
    expect(complete.mock.calls[1]![0].user).toContain('"discountedFeePerformanceCents":12300');
    expect(result.answer).toContain("$123");
    expect(result.preview).toBeNull();
  });
});
