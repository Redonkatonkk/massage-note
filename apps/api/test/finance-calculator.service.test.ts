import { describe, expect, it } from "vitest";
import { FinanceCalculatorService } from "../src/finance/finance-calculator.service.js";

describe("FinanceCalculatorService", () => {
  it("统一调用确定性领域计算器", () => {
    const service = new FinanceCalculatorService();
    const result = service.calculateRecord({
      mainServiceAmountCents: 10_000n,
      mainServiceCommissionBps: 6_000,
      addons: [],
      discountAmountsCents: [1_000n],
      cashServiceCents: 9_000n,
      cardServiceCents: 0n,
      giftCardServiceCents: 0n,
      cashTipCents: 2_000n,
      cardTipCents: 0n,
      giftCardTipCents: 0n,
    });

    expect(result.discountedFeePerformanceCents).toBe(9_000n);
    expect(result.employeeTotalIncomeCents).toBe(8_000n);
    expect(result.cashToSubmitToStoreCents).toBe(3_000n);
  });
});
