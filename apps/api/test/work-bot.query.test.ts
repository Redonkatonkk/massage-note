import { describe, it, expect } from "vitest";
import { workBotDateRange } from "../src/work-bot/work-bot-query.js";
import { parsedIntentAppearsInRawText } from "../src/work-bot/work-bot.parser.js";
import { workBotParsedIntentSchema } from "@massage-note/contracts";
const store = { timezone: "America/New_York", businessCutoffLocal: "22:00" };
const id = "11111111-1111-4111-8111-111111111111";
describe("机器人查询和编辑协议", () => {
  it("最近15天包含当前营业日且按店铺截止时间换日", () => {
    const range = workBotDateRange({ kind: "QUERY", days: 15 }, store, new Date("2026-09-09T02:01:00Z"));
    expect([range.from, range.to]).toEqual(["2026-08-26", "2026-09-09"]);
  });
  it("跨夏令时仍是15个营业日期", () => {
    const range = workBotDateRange({ kind: "QUERY", days: 15 }, store, new Date("2026-03-09T15:00:00Z"));
    expect([range.from, range.to]).toEqual(["2026-02-23", "2026-03-09"]);
  });
  it("拒绝日期歧义、反向、超过一年、无效日期及越界分页", () => {
    for (const intent of [{ kind: "QUERY", dateFrom: "2026-01-01" }, { kind: "QUERY", dateFrom: "2026-09-01", dateTo: "2026-01-01" }, { kind: "QUERY", days: 15, dateFrom: "2026-01-01", dateTo: "2026-02-01" }, { kind: "QUERY", dateFrom: "2024-01-01", dateTo: "2026-02-01" }] as const) expect(() => workBotDateRange(intent, store, new Date())).toThrow();
    expect(workBotParsedIntentSchema.safeParse({ kind: "QUERY", dateFrom: "2026-02-30", dateTo: "2026-03-01" }).success).toBe(false);
    expect(workBotParsedIntentSchema.safeParse({ kind: "QUERY", page: 0 }).success).toBe(false);
  });
  it("取消高亮不能被理解成开启，移除不能被理解成添加", () => {
    expect(parsedIntentAppearsInRawText({ kind: "ADJUST", isHighlighted: true, highlightMention: "取消高亮" }, "取消高亮")).toBe(false);
    expect(parsedIntentAppearsInRawText({ kind: "ADJUST", isHighlighted: false, highlightMention: "取消高亮" }, "取消高亮")).toBe(true);
    expect(parsedIntentAppearsInRawText({ kind: "ADJUST", addons: [{ name: "热石", mention: "移除热石", action: "ADD" }] }, "移除热石")).toBe(false);
  });
  it("编号编辑拒绝模型编造的金额、删除和高亮", () => {
    const raw = `修改 ${id} 原价 75`;
    expect(parsedIntentAppearsInRawText({ kind: "MANAGE", operation: "UPDATE", recordId: id, evidence: raw, details: { mainServiceAmountCents: 7500 } }, raw)).toBe(true);
    expect(parsedIntentAppearsInRawText({ kind: "MANAGE", operation: "UPDATE", recordId: id, evidence: raw, details: { mainServiceAmountCents: 8500 } }, raw)).toBe(false);
    expect(parsedIntentAppearsInRawText({ kind: "MANAGE", operation: "DELETE", recordId: id, evidence: raw }, raw)).toBe(false);
    expect(parsedIntentAppearsInRawText({ kind: "MANAGE", operation: "UPDATE", recordId: id, evidence: raw, details: { isHighlighted: true } }, raw)).toBe(false);
  });
});
