import { describe, expect, it } from "vitest";
import {
  formatMoneyInput,
  formatUsd,
  formatUsdPrecise,
  formatWholeDollarAmount,
} from "./money";

describe("页面金额格式", () => {
  it("中英文页面都不显示美元小数位", () => {
    expect(formatUsd(0)).toBe("US$0");
    expect(formatUsd(12_300)).toBe("US$123");
    expect(formatUsd(12_345)).toBe("US$123");
    expect(formatUsd(12_350)).toBe("US$124");
    expect(formatUsd(12_300, "en-US")).toBe("$123");
  });

  it("工资结算金额保留真实美分", () => {
    expect(formatUsdPrecise(0)).toBe("US$0.00");
    expect(formatUsdPrecise(12_300)).toBe("US$123.00");
    expect(formatUsdPrecise(12_345)).toBe("US$123.45");
    expect(formatUsdPrecise(12_350, "en-US")).toBe("$123.50");
  });

  it("卡片上的无货币符号金额同样显示为整数", () => {
    expect(formatWholeDollarAmount(3_000)).toBe("30");
    expect(formatWholeDollarAmount(3_050)).toBe("31");
    expect(formatWholeDollarAmount(-3_050)).toBe("-31");
  });

  it("编辑框去掉无意义的零但保留真实美分", () => {
    expect(formatMoneyInput(null)).toBe("");
    expect(formatMoneyInput(8_000)).toBe("80");
    expect(formatMoneyInput(8_050)).toBe("80.5");
    expect(formatMoneyInput(-125)).toBe("-1.25");
  });
});
