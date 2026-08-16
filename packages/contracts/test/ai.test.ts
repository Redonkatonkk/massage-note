import { describe, expect, it } from "vitest";
import { aiMessageSchema, aiWorkToolArgumentsSchema, confirmAiPreviewSchema } from "../src/index.js";

describe("AI 安全契约", () => {
  it("限制消息长度并要求显式确认", () => {
    expect(aiMessageSchema.parse({ text: "  查一下今天小费  " })).toMatchObject({ text: "查一下今天小费", locale: "zh-CN" });
    expect(aiMessageSchema.parse({ text: "tips today", locale: "en-US" }).locale).toBe("en-US");
    expect(aiMessageSchema.safeParse({ text: "tips today", locale: "fr-FR" }).success).toBe(false);
    expect(confirmAiPreviewSchema.safeParse({ confirm: false }).success).toBe(false);
  });

  it("工具参数拒绝未知字段和负数金额", () => {
    expect(aiWorkToolArgumentsSchema.safeParse({ operation: "CREATE", employeeName: "Amy", serviceName: "按摩", serviceDurationMinutes: 60, cashServiceCents: 10_000 }).success).toBe(true);
    expect(aiWorkToolArgumentsSchema.safeParse({ operation: "CREATE", employeeName: "Amy", serviceName: "按摩", serviceDurationMinutes: 60, addons: [{ name: "热石" }], discounts: [{ name: "优惠", amountCents: 500 }] }).success).toBe(true);
    expect(aiWorkToolArgumentsSchema.safeParse({ operation: "CREATE", employeeName: "Amy", serviceName: "按摩", serviceDurationMinutes: 60, cashServiceCents: -1 }).success).toBe(false);
    expect(aiWorkToolArgumentsSchema.safeParse({ operation: "CREATE", employeeName: "Amy", serviceName: "按摩" }).success).toBe(false);
    expect(aiWorkToolArgumentsSchema.safeParse({ operation: "DELETE", recordId: crypto.randomUUID(), reason: "重复", arbitrarySql: "DROP TABLE" }).success).toBe(false);
  });
});
