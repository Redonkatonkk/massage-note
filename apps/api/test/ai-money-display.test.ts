import { describe, expect, it } from "vitest";
import {
  formatWholeUsd,
  normalizeWholeUsdText,
} from "../src/ai/money-display.js";

describe("AI 页面金额显示", () => {
  it("把确定性财务金额格式化为整美元", () => {
    expect(formatWholeUsd(27_000n)).toBe("$270");
    expect(formatWholeUsd(12_345n)).toBe("$123");
    expect(formatWholeUsd(12_350n)).toBe("$124");
    expect(formatWholeUsd(-150n)).toBe("-$2");
  });

  it("移除外部模型回答中自行添加的金额小数位", () => {
    expect(normalizeWholeUsdText("大费 $270.00，小费 US$35.50，调整 -$1.25"))
      .toBe("大费 $270，小费 US$36，调整 -$1");
    expect(normalizeWholeUsdText("Total $1,234 and precise $1.234 with a 5.00% discount"))
      .toBe("Total $1,234 and precise $1 with a 5.00% discount");
  });
});
