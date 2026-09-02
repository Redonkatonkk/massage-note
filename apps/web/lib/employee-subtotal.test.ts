import { describe, expect, it } from "vitest";
import { formatEffectiveCommissionRate } from "./employee-subtotal";

describe("formatEffectiveCommissionRate", () => {
  it("兼容带小数的综合分成比例", () => {
    expect(formatEffectiveCommissionRate(10_100, 6_063)).toBe("60.0297%");
  });

  it("没有大费基数时不显示虚假的比例", () => {
    expect(formatEffectiveCommissionRate(0, 0)).toBe("—");
  });
});
