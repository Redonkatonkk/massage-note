import { describe, expect, it } from "vitest";
import {
  CLOSING_DELIVERY_PHONE_REQUIRED_MESSAGE,
  effectiveClosingDeliveryPhone,
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
