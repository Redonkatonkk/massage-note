import { describe, expect, it, vi } from "vitest";
import { AiService } from "../src/ai/ai.service.js";

function setup(role = "OWNER") {
  const logs: any[] = [];
  const empty = { findMany: vi.fn().mockResolvedValue([]) };
  const membership = { id: "00000000-0000-4000-8000-000000000001", role, displayName: "Amy" };
  const prisma = {
    store: { findFirst: vi.fn().mockResolvedValue({ timezone: "America/New_York", businessCutoffLocal: "22:00" }), findUniqueOrThrow: vi.fn().mockResolvedValue({ timezone: "America/New_York", businessCutoffLocal: "22:00" }) },
    storeMembership: empty, serviceItem: empty, addonItem: empty, discountItem: empty, workRecord: empty,
    aiConversation: { create: vi.fn().mockResolvedValue({ id: "conversation" }), findFirst: vi.fn().mockResolvedValue({ id: "conversation" }), update: vi.fn().mockResolvedValue({ id: "conversation" }) },
    aiQueryLog: { create: vi.fn(async ({ data }) => { logs.push(data); }), findMany: vi.fn(async () => [...logs]) },
  };
  const complete = vi.fn().mockResolvedValue({ content: "请补充时长", provider: "test", model: "test" });
  const summary = vi.fn(async (_actor, _store, query) => ({ filters: query, totals: {}, days: [] }));
  const ai = new AiService(prisma as never, { requireActiveMembership: vi.fn(async () => membership) } as never, { summary } as never, {} as never, {} as never, { isConfigured: () => true, complete } as never, {} as never);
  return { ai, complete, summary, logs, prisma, membership };
}
const actor = { id: "user" } as never;

describe("same-conversation memory", () => {
  it("persists replies and replays them during follow-up tool queries", async () => {
    const { ai, complete, prisma } = setup();
    await ai.workMessage(actor, "store", { text: "给 Amy 记按摩" });
    complete.mockResolvedValueOnce({ content: "", provider: "test", model: "test", toolCall: { name: "read_business_data", arguments: { table: "WorkRecord" } } });
    await ai.workMessage(actor, "store", { text: "60分钟，现金100", conversationId: "conversation" });
    const history = complete.mock.calls[1]![0].history;
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: "user", content: "给 Amy 记按摩" });
    expect(history[1].content).toContain("请补充时长");
    expect(complete.mock.calls[2]![0].history).toEqual(history);
    expect(prisma.aiQueryLog.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { conversationId: "conversation", storeId: "store", userId: "user", outcome: { not: "ERROR" } } }));
  });

  it("does not load another session or replay data after a role change", async () => {
    const { ai, complete, membership, prisma } = setup();
    await ai.workMessage(actor, "store", { text: "全店记录" });
    await ai.workMessage(actor, "store", { text: "新会话" });
    expect(complete.mock.calls[1]![0].history).toEqual([]);
    expect(prisma.aiQueryLog.findMany).not.toHaveBeenCalled();
    membership.role = "EMPLOYEE";
    await ai.workMessage(actor, "store", { text: "继续", conversationId: "conversation" });
    expect(complete.mock.calls[2]![0].history).toEqual([]);
  });

  it("rejects a conversation that does not belong to this user, store and assistant", async () => {
    const { ai, prisma, complete } = setup();
    prisma.aiConversation.findFirst.mockResolvedValue(null as never);
    await expect(ai.workMessage(actor, "store", { text: "继续", conversationId: "other" })).rejects.toThrow();
    expect(prisma.aiConversation.findFirst).toHaveBeenCalledWith({ where: { id: "other", storeId: "store", userId: "user", assistantType: "WORK_RECORD" } });
    expect(complete).not.toHaveBeenCalled();
  });

  it("resolves finance follow-ups from history before querying fresh statistics", async () => {
    const { ai, complete, summary } = setup();
    await ai.financeMessage(actor, "store", { text: "过去15天现金大费" });
    const firstQuery = summary.mock.calls[0]![2];
    complete.mockResolvedValueOnce({ content: "", provider: "test", model: "test", toolCall: { name: "resolve_finance_query", arguments: { ...firstQuery, amountType: "TIP" } } });
    await ai.financeMessage(actor, "store", { text: "那小费呢", conversationId: "conversation" });
    expect(complete.mock.calls[1]![0].history[0].content).toBe("过去15天现金大费");
    expect(summary.mock.calls[1]![2]).toMatchObject({ dateFrom: firstQuery.dateFrom, dateTo: firstQuery.dateTo, paymentMethod: "CASH", amountType: "TIP" });
    expect(complete.mock.calls[2]![0].history).toHaveLength(2);
  });
});
