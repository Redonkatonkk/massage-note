import { describe, expect, it } from "vitest";
import {
  DomainError,
  calculateDailyCashSettlement,
  calculatePersonalClosingCashToSubmit,
  calculatePersonalClosingPaymentDividends,
  calculatePayrollBalance,
  calculatePayrollPaymentTotal,
  calculateWorkRecordFinance,
  type WorkRecordFinanceInput,
} from "../src/index.js";

function record(
  overrides: Partial<WorkRecordFinanceInput> = {},
): WorkRecordFinanceInput {
  return {
    mainServiceAmountCents: 10_000n,
    mainServiceCommissionBps: 6_000,
    addons: [],
    discountAmountsCents: [],
    cashServiceCents: 10_000n,
    cardServiceCents: 0n,
    cashTipCents: 2_000n,
    cardTipCents: 0n,
    ...overrides,
  };
}

describe("单条记工财务", () => {
  it("计算单一现金付款", () => {
    const result = calculateWorkRecordFinance(record());
    expect(result.grossFeeBaseCents).toBe(10_000n);
    expect(result.totalLargeFeeWageCents).toBe(6_000n);
    expect(result.employeeTotalIncomeCents).toBe(8_000n);
    expect(result.employeeCashRetainedCents).toBe(8_000n);
    expect(result.cashToSubmitToStoreCents).toBe(4_000n);
  });

  it("计算单一刷卡付款和刷卡小费", () => {
    const result = calculateWorkRecordFinance(
      record({
        cashServiceCents: 0n,
        cardServiceCents: 10_000n,
        cashTipCents: 0n,
        cardTipCents: 2_000n,
      }),
    );
    expect(result.cashAcquiredServiceWageCents).toBe(0n);
    expect(result.employeeCashRetainedCents).toBe(0n);
    expect(result.employeeTotalIncomeCents).toBe(8_000n);
  });

  it("大费刷卡、小费现金", () => {
    const result = calculateWorkRecordFinance(
      record({ cashServiceCents: 0n, cardServiceCents: 10_000n }),
    );
    expect(result.employeeCashReceivedCents).toBe(2_000n);
    expect(result.employeeCashRetainedCents).toBe(2_000n);
    expect(result.cashToSubmitToStoreCents).toBe(0n);
  });

  it("混合大费按实际付款比例分摊工资", () => {
    const result = calculateWorkRecordFinance(
      record({
        cashServiceCents: 3_000n,
        cardServiceCents: 7_000n,
        cashTipCents: 0n,
      }),
    );
    expect(result.cashAllocatedServiceWageCents).toBe(1_800n);
    expect(result.cashAcquiredServiceWageCents).toBe(1_800n);
    expect(result.cashToSubmitToStoreCents).toBe(1_200n);
  });

  it("多个额外项目分别按各自比例计算工资", () => {
    const result = calculateWorkRecordFinance(
      record({
        addons: [
          { amountCents: 2_000n, commissionBps: 5_000 },
          { amountCents: 1_001n, commissionBps: 3_333 },
        ],
        cashServiceCents: 13_001n,
      }),
    );
    expect(result.addonTotalCents).toBe(3_001n);
    expect(result.addonWageCents).toBe(1_334n);
    expect(result.totalLargeFeeWageCents).toBe(7_334n);
  });

  it("多个折扣降低业绩但不降低工资", () => {
    const result = calculateWorkRecordFinance(
      record({
        discountAmountsCents: [500n, 1_000n],
        cashServiceCents: 8_500n,
      }),
    );
    expect(result.discountTotalCents).toBe(1_500n);
    expect(result.discountedFeePerformanceCents).toBe(8_500n);
    expect(result.totalLargeFeeWageCents).toBe(6_000n);
  });

  it("允许实收与折后金额不匹配但给出标记", () => {
    const result = calculateWorkRecordFinance(
      record({ cashServiceCents: 9_000n }),
    );
    expect(result.paymentDifferenceCents).toBe(-1_000n);
    expect(result.hasPaymentMismatch).toBe(true);
  });

  it("拒绝折扣超过大费基数", () => {
    expect(() =>
      calculateWorkRecordFinance(
        record({ discountAmountsCents: [10_001n] }),
      ),
    ).toThrow(DomainError);
  });

  it("免费服务仍计算工资，现金取得为零", () => {
    const result = calculateWorkRecordFinance(
      record({
        discountAmountsCents: [10_000n],
        cashServiceCents: 0n,
        cashTipCents: 0n,
      }),
    );
    expect(result.discountedFeePerformanceCents).toBe(0n);
    expect(result.totalLargeFeeWageCents).toBe(6_000n);
    expect(result.cashAcquiredServiceWageCents).toBe(0n);
    expect(result.hasZeroServiceCollected).toBe(true);
  });

  it("现金不足时不把未拿到的钱算作已取得", () => {
    const result = calculateWorkRecordFinance(
      record({
        discountAmountsCents: [9_000n],
        cashServiceCents: 1_000n,
        cashTipCents: 0n,
      }),
    );
    expect(result.cashAllocatedServiceWageCents).toBe(6_000n);
    expect(result.cashAcquiredServiceWageCents).toBe(1_000n);
    expect(result.cashWageShortfallCents).toBe(5_000n);
    expect(result.cashToSubmitToStoreCents).toBe(0n);
  });

  it("混合付款的半美分按规则舍入", () => {
    const result = calculateWorkRecordFinance(
      record({
        mainServiceAmountCents: 101n,
        mainServiceCommissionBps: 5_000,
        cashServiceCents: 1n,
        cardServiceCents: 1n,
        cashTipCents: 0n,
      }),
    );
    expect(result.totalLargeFeeWageCents).toBe(51n);
    expect(result.cashAllocatedServiceWageCents).toBe(26n);
    expect(result.cashAcquiredServiceWageCents).toBe(1n);
    expect(result.cashWageShortfallCents).toBe(25n);
  });
});

describe("日现金结算与工资余额", () => {
  it("个人日结按现金大费项目的折前基数计算店铺四成", () => {
    expect(
      calculatePersonalClosingCashToSubmit([
        { grossFeeBaseCents: 10_000n, cashServiceCents: 9_500n },
        { grossFeeBaseCents: 8_000n, cashServiceCents: 1n },
        { grossFeeBaseCents: 12_000n, cashServiceCents: 0n },
      ]),
    ).toBe(7_200n);
  });

  it("个人日结按已确认付款拆分现金与刷卡的大费和小费分红", () => {
    expect(
      calculatePersonalClosingPaymentDividends([
        {
          totalLargeFeeWageCents: 6_000n,
          cashAllocatedServiceWageCents: 2_400n,
          cashServiceCents: 4_000n,
          cardServiceCents: 6_000n,
          cashTipCents: 1_000n,
          cardTipCents: 2_000n,
        },
        {
          totalLargeFeeWageCents: 4_000n,
          cashAllocatedServiceWageCents: 0n,
          cashServiceCents: 0n,
          cardServiceCents: 8_000n,
          cashTipCents: 500n,
          cardTipCents: 1_500n,
        },
        {
          totalLargeFeeWageCents: 1_000n,
          cashAllocatedServiceWageCents: 1_000n,
          cashServiceCents: 1_000n,
          cardServiceCents: 0n,
          cashTipCents: 500n,
          cardTipCents: 500n,
        },
      ]),
    ).toEqual({
      cashLargeFeeDividendCents: 3_400n,
      cashTipDividendCents: 2_000n,
      cardLargeFeeDividendCents: 7_600n,
      cardTipDividendCents: 4_000n,
    });
  });

  it("免费项目的工资归入非现金分红并保持已确认收入守恒", () => {
    const dividends = calculatePersonalClosingPaymentDividends([
      {
        totalLargeFeeWageCents: 6_000n,
        cashAllocatedServiceWageCents: 0n,
        cashServiceCents: 0n,
        cardServiceCents: 0n,
        cashTipCents: 500n,
        cardTipCents: 1_000n,
      },
    ]);

    expect(dividends).toEqual({
      cashLargeFeeDividendCents: 0n,
      cashTipDividendCents: 500n,
      cardLargeFeeDividendCents: 6_000n,
      cardTipDividendCents: 1_000n,
    });
    expect(Object.values(dividends).reduce((sum, amount) => sum + amount, 0n))
      .toBe(7_500n);
  });

  it("汇总多条记录", () => {
    const records = [
      calculateWorkRecordFinance(record()),
      calculateWorkRecordFinance(
        record({
          cashServiceCents: 0n,
          cardServiceCents: 10_000n,
          cashTipCents: 500n,
        }),
      ),
    ];
    const result = calculateDailyCashSettlement(records);
    expect(result.cashReceivedCents).toBe(12_500n);
    expect(result.cashRetainedCents).toBe(8_500n);
    expect(result.cashToSubmitToStoreCents).toBe(4_000n);
  });

  it("计算老板尚欠和超额支付", () => {
    expect(
      calculatePayrollBalance({
        cumulativeEmployeeIncomeCents: 100_000n,
        settledCashAcquiredCents: 30_000n,
        payrollPaidCents: 50_000n,
      }),
    ).toEqual({
      rawBalanceCents: 20_000n,
      employerOwesCents: 20_000n,
      overpaidCents: 0n,
    });

    expect(
      calculatePayrollBalance({
        cumulativeEmployeeIncomeCents: 100_000n,
        settledCashAcquiredCents: 30_000n,
        payrollPaidCents: 80_000n,
      }).overpaidCents,
    ).toBe(10_000n);
  });

  it("工资账本总额由后端字段相加", () => {
    expect(
      calculatePayrollPaymentTotal({
        serviceWageCents: 50_000n,
        cashTipCents: 2_000n,
        cardTipCents: 10_000n,
        adjustmentCents: -1_000n,
      }),
    ).toBe(61_000n);
  });
});
