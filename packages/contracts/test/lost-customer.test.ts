import { describe, expect, it } from "vitest";
import { createLostCustomerSchema, deleteLostCustomerSchema, updateLostCustomerSchema } from "../src/index.js";

describe("跑客记录契约", () => {
  it("接受每位跑客的营业日与本地时间", () => {
    expect(createLostCustomerSchema.parse({ businessDate: "2026-09-23", occurredTime: "09:05" }))
      .toEqual({ businessDate: "2026-09-23", occurredTime: "09:05" });
  });
  it("拒绝非法时间并要求修改和删除携带有效版本", () => {
    expect(createLostCustomerSchema.safeParse({ businessDate: "2026-09-23", occurredTime: "24:01" }).success).toBe(false);
    expect(updateLostCustomerSchema.safeParse({ version: 1, occurredTime: "9:05" }).success).toBe(false);
    expect(deleteLostCustomerSchema.safeParse({ version: 0 }).success).toBe(false);
  });
});

describe("跑客备注契约", () => {
  const create = { businessDate: "2026-09-23", occurredTime: "09:05" };

  it("备注可省略，创建和修改都会去除首尾空白并限制 500 字", () => {
    expect(createLostCustomerSchema.parse({ ...create, note: "  带客户看礼物卡  " }).note).toBe("带客户看礼物卡");
    expect(createLostCustomerSchema.parse({ ...create }).note).toBeUndefined();
    expect(updateLostCustomerSchema.parse({ version: 1, occurredTime: "09:20", note: " 备注 " }).note).toBe("备注");
    expect(createLostCustomerSchema.safeParse({ ...create, note: "x".repeat(501) }).success).toBe(false);
    expect(updateLostCustomerSchema.safeParse({ version: 1, occurredTime: "09:20", note: "x".repeat(501) }).success).toBe(false);
  });

  it("允许显式空备注用于清除", () => {
    expect(updateLostCustomerSchema.parse({ version: 1, occurredTime: "09:20", note: "" }).note).toBe("");
  });
});
