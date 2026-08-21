import { describe, expect, it } from "vitest";
import { giftCardSerialNumberForCreate } from "./gift-card";

describe("礼物卡销售序列号", () => {
  it("未修改系统建议号码时交由服务端并发安全地自动分配", () => {
    expect(giftCardSerialNumberForCreate("1001", false)).toBeUndefined();
  });

  it("提交去除首尾空白的自定义号码，并拒绝空号码", () => {
    expect(giftCardSerialNumberForCreate(" GC-VIP-8 ", true)).toBe("GC-VIP-8");
    expect(() => giftCardSerialNumberForCreate("  ", true)).toThrow("请填写礼物卡序列号");
  });
});
