import { describe, expect, it } from "vitest";
import {
  CLOSING_DELIVERY_PHONE_REQUIRED_MESSAGE,
  effectiveClosingDeliveryPhone,
  displayUsPhone,
  usPhoneToE164,
  validateClosingDeliveryPhone,
} from "./member-closing-delivery";

describe("成员个人日结短信号码", () => {
  it("没有专用号码时回填注册手机号", () => {
    expect(effectiveClosingDeliveryPhone(null, "+16465550123")).toBe("+16465550123");
    expect(effectiveClosingDeliveryPhone("+12125550123", "+16465550123")).toBe("+12125550123");
  });

  it("开启接收但两个号码都为空时阻止保存", () => {
    expect(() => validateClosingDeliveryPhone(true, "", undefined)).toThrow(
      CLOSING_DELIVERY_PHONE_REQUIRED_MESSAGE,
    );
    expect(validateClosingDeliveryPhone(false, "", undefined)).toBe("");
  });
});

describe("美国号码输入", () => {
  it("显示与粘贴美国号码时省略国家代码", () => {
    expect(displayUsPhone("+1 (212) 555-0123")).toBe("2125550123");
    expect(displayUsPhone("12125550123")).toBe("2125550123");
    expect(displayUsPhone(null)).toBe("");
    expect(displayUsPhone(undefined)).toBe("");
  });
  it("提交时补全国家代码并拒绝不完整或非美国号码", () => {
    expect(usPhoneToE164("2125550123")).toBe("+12125550123");
    expect(usPhoneToE164("+1 (212) 555-0123")).toBe("+12125550123");
    for (const phone of ["", "212555", "212555012345", "+442071234567", "abcdefghij"]) {
      expect(() => usPhoneToE164(phone)).toThrow("请输入 10 位美国电话号码");
    }
  });
});
