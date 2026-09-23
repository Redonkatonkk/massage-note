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
