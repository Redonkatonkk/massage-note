import { describe, expect, it } from "vitest";
import { giftCardActualDiscount, giftCardSerialNumberForCreate } from "./gift-card";

describe("礼物卡销售序列号", () => {
  it("未修改系统建议号码时交由服务端并发安全地自动分配", () => {
    expect(giftCardSerialNumberForCreate("1001", false)).toBeUndefined();
  });

  it("提交去除首尾空白的自定义号码，并拒绝空号码", () => {
    expect(giftCardSerialNumberForCreate(" GC-VIP-8 ", true)).toBe("GC-VIP-8");
    expect(() => giftCardSerialNumberForCreate("  ", true)).toThrow("请填写礼物卡序列号");
  });
});

describe("按实收展示礼物卡折扣", () => {
  it("按实际收款而非规则折扣计算金额与比例", () => {
    expect(giftCardActualDiscount(10000, 8500)).toBe("折扣 15% · -US$15");
    expect(giftCardActualDiscount(15000, 12500)).toBe("折扣 16.67% · -US$25");
  });
  it("原价或超额实收不显示负折扣", () => {
    expect(giftCardActualDiscount(10000, 10000)).toBe("无折扣");
    expect(giftCardActualDiscount(10000, 11000)).toBe("无折扣");
  });
});
