import { describe, expect, it } from "vitest";
import { formatCommissionRate } from "./employee-subtotal";

describe("formatCommissionRate", () => {
  it("直接格式化员工默认提成并保留基点精度", () => {
    expect(formatCommissionRate(6_055)).toBe("60.55%");
    expect(formatCommissionRate(6_000)).toBe("60%");
  });

  it("没有员工默认提成时说明沿用项目或店铺设置", () => {
    expect(formatCommissionRate(null)).toBe("跟随项目/店铺");
    expect(formatCommissionRate(null, "en-US")).toBe("Uses item/store rate");
  });
});
