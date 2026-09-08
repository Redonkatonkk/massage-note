import { afterEach, describe, expect, it, vi } from "vitest";
import type { User } from "@massage-note/database";
import { AiService } from "../src/ai/ai.service.js";

function setup(configured = false, role = "OWNER") {
  const prisma = {
    store: { findUniqueOrThrow: vi.fn().mockResolvedValue({ timezone: "America/New_York", businessCutoffLocal: "22:00" }) },
    storeMembership: { findMany: vi.fn().mockResolvedValue([{ id: "member", displayName: "Amy" }]) },
    aiConversation: { create: vi.fn().mockResolvedValue({ id: "conversation" }) },
    aiQueryLog: { create: vi.fn().mockResolvedValue({}) },
  };
  const access = { requireActiveMembership: vi.fn().mockResolvedValue({ id: "member", role, displayName: "Amy" }) };
  const finance = { summary: vi.fn().mockImplementation(async (_actor, _store, query) => ({
    filters: query,
    totals: { discountedFeePerformanceCents: 12300n },
    days: [{ businessDate: "2026-08-25", discountedFeePerformanceCents: 12300n, recordCount: 1 }],
  })) };
  const model = { isConfigured: () => configured, complete: vi.fn().mockResolvedValue({ content: "统计结果", provider: "test", model: "test" }) };
  const ai = new AiService(prisma as never, access as never, finance as never, {} as never, {} as never, model as never, {} as never);
  return { ai, finance, model };
}
const actor = { id: "user" } as User;
afterEach(() => vi.useRealTimers());

describe("财务 AI 日期和逐日查询", () => {
  it.each(["过去 15 天", "过去15天", "最近 15 天", "近15天", "past 15 days", "last 15 days"])("识别 %s，跨月查询完整 15 个营业日", async (text) => {
    vi.useFakeTimers().setSystemTime(new Date("2026-09-08T01:58:00Z"));
    const { ai, finance } = setup(true);
    await ai.financeMessage(actor, "store", { text });
    expect(finance.summary).toHaveBeenCalledWith(actor, "store", expect.objectContaining({ dateFrom: "2026-08-24", dateTo: "2026-09-07" }));
  });

  it.each([false, true])("完整逐日金额不依赖模型生成（configured=%s）", async (configured) => {
    vi.useFakeTimers().setSystemTime(new Date("2026-09-08T01:58:00Z"));
    const { ai, model } = setup(configured);
    const response = await ai.financeMessage(actor, "store", { text: "查一下过去 15 天，每天的折后大费是多少，全给我" });
    const rows = response.answer.split("\n").filter((line) => /^2026-\d{2}-\d{2}：/.test(line));
    expect(rows).toHaveLength(15);
    expect(rows[0]).toBe("2026-08-24：$0（当前筛选下无记工记录）");
    expect(rows[1]).toBe("2026-08-25：$123");
    expect(rows[14]).toBe("2026-09-07：$0（当前筛选下无记工记录）");
    expect(response.answer).toContain("合计：$123");
    if (configured) expect(model.complete.mock.calls[0]?.[0].user).toContain('"dateFrom":"2026-08-24"');
  });

  it("跨年且继续限制普通员工只能查询自己", async () => {
    vi.useFakeTimers().setSystemTime(new Date("2026-01-05T17:00:00Z"));
    const { ai, finance } = setup(true, "EMPLOYEE");
    await ai.financeMessage(actor, "store", { text: "过去15天全店大费" });
    expect(finance.summary).toHaveBeenCalledWith(actor, "store", expect.objectContaining({ dateFrom: "2025-12-22", dateTo: "2026-01-05", membershipIds: ["member"] }));
  });

  it.each([["今天大费", "2026-09-07"], ["本月大费", "2026-09-01"], ["最近7天小费", "2026-09-01"]])("保留已有日期表达：%s", async (text, dateFrom) => {
    vi.useFakeTimers().setSystemTime(new Date("2026-09-08T01:58:00Z"));
    const { ai, finance } = setup(true);
    await ai.financeMessage(actor, "store", { text });
    expect(finance.summary).toHaveBeenCalledWith(actor, "store", expect.objectContaining({ dateFrom, dateTo: "2026-09-07" }));
  });
});
