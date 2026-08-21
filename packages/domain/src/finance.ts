import { DomainError } from "./errors.js";
import {
  basisPoints,
  cents,
  minCents,
  multiplyByBps,
  roundHalfUp,
  sumCents,
  type BasisPoints,
  type Cents,
} from "./money.js";

export interface AddonWageInput {
  amountCents: Cents;
  commissionBps: BasisPoints;
}

export interface WorkRecordFinanceInput {
  mainServiceAmountCents: Cents;
  mainServiceCommissionBps: BasisPoints;
  addons: readonly AddonWageInput[];
  discountAmountsCents: readonly Cents[];
  cashServiceCents: Cents;
  cardServiceCents: Cents;
  giftCardServiceCents: Cents;
  cashTipCents: Cents;
  cardTipCents: Cents;
  giftCardTipCents: Cents;
}

export interface WorkRecordFinance {
  mainServiceAmountCents: Cents;
  addonTotalCents: Cents;
  grossFeeBaseCents: Cents;
  discountTotalCents: Cents;
  discountedFeePerformanceCents: Cents;
  cashServiceCents: Cents;
  cardServiceCents: Cents;
  giftCardServiceCents: Cents;
  actualServiceCollectedCents: Cents;
  paymentDifferenceCents: bigint;
  cashTipCents: Cents;
  cardTipCents: Cents;
  giftCardTipCents: Cents;
  totalTipCents: Cents;
  customerTotalPaidCents: Cents;
  mainServiceWageCents: Cents;
  addonWageCents: Cents;
  totalLargeFeeWageCents: Cents;
  employeeTotalIncomeCents: Cents;
  cashAllocatedServiceWageCents: Cents;
  cashAcquiredServiceWageCents: Cents;
  cashWageShortfallCents: Cents;
  employeeCashReceivedCents: Cents;
  employeeCashRetainedCents: Cents;
  cashToSubmitToStoreCents: Cents;
  hasPaymentMismatch: boolean;
  hasZeroServiceCollected: boolean;
}

export interface StoreIncomeInput {
  discountedFeePerformanceCents: Cents;
  totalTipCents: Cents;
  employeeIncomeCents: Cents;
  giftCardSalesAmountCents: Cents;
  giftCardRedemptionCents: Cents;
}

/**
 * 店铺经营收入把卖卡实收记为收入，把客人用礼物卡付款的金额记为支出。
 * 结果允许为负数，因此返回 bigint 而不是只允许非负数的 Cents。
 */
export function calculateStoreIncome(input: StoreIncomeInput): bigint {
  const discountedFeePerformanceCents = cents(
    input.discountedFeePerformanceCents,
  );
  const totalTipCents = cents(input.totalTipCents);
  const employeeIncomeCents = cents(input.employeeIncomeCents);
  const giftCardSalesAmountCents = cents(input.giftCardSalesAmountCents);
  const giftCardRedemptionCents = cents(input.giftCardRedemptionCents);

  return (
    discountedFeePerformanceCents +
    totalTipCents -
    employeeIncomeCents +
    giftCardSalesAmountCents -
    giftCardRedemptionCents
  );
}

export function calculateWorkRecordFinance(
  input: WorkRecordFinanceInput,
): WorkRecordFinance {
  const mainServiceAmountCents = cents(input.mainServiceAmountCents);
  const mainServiceCommissionBps = basisPoints(input.mainServiceCommissionBps);
  const addons = input.addons.map((addon) => ({
    amountCents: cents(addon.amountCents),
    commissionBps: basisPoints(addon.commissionBps),
  }));
  const discounts = input.discountAmountsCents.map(cents);
  const cashServiceCents = cents(input.cashServiceCents);
  const cardServiceCents = cents(input.cardServiceCents);
  const giftCardServiceCents = cents(input.giftCardServiceCents);
  const cashTipCents = cents(input.cashTipCents);
  const cardTipCents = cents(input.cardTipCents);
  const giftCardTipCents = cents(input.giftCardTipCents);

  const addonTotalCents = sumCents(addons.map((addon) => addon.amountCents));
  const grossFeeBaseCents = mainServiceAmountCents + addonTotalCents;
  const discountTotalCents = sumCents(discounts);
  if (discountTotalCents > grossFeeBaseCents) {
    throw new DomainError(
      "DISCOUNT_EXCEEDS_GROSS",
      "折扣不能超过大费总额",
    );
  }

  const discountedFeePerformanceCents = grossFeeBaseCents - discountTotalCents;
  const actualServiceCollectedCents =
    cashServiceCents + cardServiceCents + giftCardServiceCents;
  const totalTipCents = cashTipCents + cardTipCents + giftCardTipCents;
  const customerTotalPaidCents = actualServiceCollectedCents + totalTipCents;
  const mainServiceWageCents = multiplyByBps(
    mainServiceAmountCents,
    mainServiceCommissionBps,
  );
  const addonWageCents = sumCents(
    addons.map((addon) =>
      multiplyByBps(addon.amountCents, addon.commissionBps),
    ),
  );
  const totalLargeFeeWageCents = mainServiceWageCents + addonWageCents;
  const employeeTotalIncomeCents = totalLargeFeeWageCents + totalTipCents;
  const cashAllocatedServiceWageCents =
    actualServiceCollectedCents === 0n
      ? 0n
      : roundHalfUp(
          totalLargeFeeWageCents * cashServiceCents,
          actualServiceCollectedCents,
        );
  const cashAcquiredServiceWageCents = minCents(
    cashServiceCents,
    cashAllocatedServiceWageCents,
  );
  const cashWageShortfallCents =
    cashAllocatedServiceWageCents - cashAcquiredServiceWageCents;
  const employeeCashReceivedCents = cashServiceCents + cashTipCents;
  const employeeCashRetainedCents =
    cashAcquiredServiceWageCents + cashTipCents;
  const cashToSubmitToStoreCents =
    cashServiceCents - cashAcquiredServiceWageCents;
  const paymentDifferenceCents =
    actualServiceCollectedCents - discountedFeePerformanceCents;

  return {
    mainServiceAmountCents,
    addonTotalCents,
    grossFeeBaseCents,
    discountTotalCents,
    discountedFeePerformanceCents,
    cashServiceCents,
    cardServiceCents,
    giftCardServiceCents,
    actualServiceCollectedCents,
    paymentDifferenceCents,
    cashTipCents,
    cardTipCents,
    giftCardTipCents,
    totalTipCents,
    customerTotalPaidCents,
    mainServiceWageCents,
    addonWageCents,
    totalLargeFeeWageCents,
    employeeTotalIncomeCents,
    cashAllocatedServiceWageCents,
    cashAcquiredServiceWageCents,
    cashWageShortfallCents,
    employeeCashReceivedCents,
    employeeCashRetainedCents,
    cashToSubmitToStoreCents,
    hasPaymentMismatch: paymentDifferenceCents !== 0n,
    hasZeroServiceCollected: actualServiceCollectedCents === 0n,
  };
}

export interface DailyCashSettlement {
  cashServiceCents: Cents;
  cashTipCents: Cents;
  cashReceivedCents: Cents;
  cashAllocatedServiceWageCents: Cents;
  cashAcquiredServiceWageCents: Cents;
  cashWageShortfallCents: Cents;
  cashRetainedCents: Cents;
  cashToSubmitToStoreCents: Cents;
}

type DailyCashSettlementRecord = Pick<
  WorkRecordFinance,
  | "cashServiceCents"
  | "cashTipCents"
  | "cashAllocatedServiceWageCents"
  | "cashAcquiredServiceWageCents"
  | "cashWageShortfallCents"
>;

export function calculateDailyCashSettlement(
  records: readonly DailyCashSettlementRecord[],
): DailyCashSettlement {
  const cashServiceCents = sumCents(records.map((record) => record.cashServiceCents));
  const cashTipCents = sumCents(records.map((record) => record.cashTipCents));
  const cashAllocatedServiceWageCents = sumCents(
    records.map((record) => record.cashAllocatedServiceWageCents),
  );
  const cashAcquiredServiceWageCents = sumCents(
    records.map((record) => record.cashAcquiredServiceWageCents),
  );
  const cashWageShortfallCents = sumCents(
    records.map((record) => record.cashWageShortfallCents),
  );

  return {
    cashServiceCents,
    cashTipCents,
    cashReceivedCents: cashServiceCents + cashTipCents,
    cashAllocatedServiceWageCents,
    cashAcquiredServiceWageCents,
    cashWageShortfallCents,
    cashRetainedCents: cashAcquiredServiceWageCents + cashTipCents,
    cashToSubmitToStoreCents: cashServiceCents - cashAcquiredServiceWageCents,
  };
}

export interface PersonalClosingCashRecord {
  grossFeeBaseCents: Cents;
  cashServiceCents: Cents;
}

/**
 * 个人日结的“应提交现金”按含现金大费的已确认项目折前基数计算，
 * 不使用折后实收现金，也不复用每日现金结算中的实际留存公式。
 */
export function calculatePersonalClosingCashToSubmit(
  records: readonly PersonalClosingCashRecord[],
): Cents {
  const cashProjectGrossFeeBaseCents = sumCents(
    records.map((record) => {
      const grossFeeBaseCents = cents(record.grossFeeBaseCents);
      const cashServiceCents = cents(record.cashServiceCents);
      return cashServiceCents > 0n ? grossFeeBaseCents : 0n;
    }),
  );

  return multiplyByBps(cashProjectGrossFeeBaseCents, 4_000);
}

export interface PersonalClosingPaymentRecord {
  totalLargeFeeWageCents: Cents;
  cashAllocatedServiceWageCents: Cents;
  cashServiceCents: Cents;
  cardServiceCents: Cents;
  cashTipCents: Cents;
  cardTipCents: Cents;
  giftCardTipCents?: Cents;
}

export interface PersonalClosingPaymentDividends {
  cashLargeFeeDividendCents: Cents;
  cashTipDividendCents: Cents;
  cardLargeFeeDividendCents: Cents;
  cardTipDividendCents: Cents;
}

/**
 * 个人日结的四项分红只汇总已确认记工：大费工资先按现金付款比例分配，
 * 其余未通过现金分配的工资归入刷卡／非现金，小费按实际确认方式归类。
 */
export function calculatePersonalClosingPaymentDividends(
  records: readonly PersonalClosingPaymentRecord[],
): PersonalClosingPaymentDividends {
  const wageDividends = records.map((record) => {
    const totalLargeFeeWageCents = cents(record.totalLargeFeeWageCents);
    const cashAllocatedServiceWageCents = cents(
      record.cashAllocatedServiceWageCents,
    );
    if (cashAllocatedServiceWageCents > totalLargeFeeWageCents) {
      throw new DomainError(
        "CASH_ALLOCATED_WAGE_EXCEEDS_TOTAL",
        "现金对应工资不能超过大费工资",
      );
    }
    return {
      cashLargeFeeDividendCents: cashAllocatedServiceWageCents,
      cardLargeFeeDividendCents:
        totalLargeFeeWageCents - cashAllocatedServiceWageCents,
    };
  });

  return {
    cashLargeFeeDividendCents: sumCents(
      wageDividends.map((record) => record.cashLargeFeeDividendCents),
    ),
    cashTipDividendCents: sumCents(
      records.map((record) => cents(record.cashTipCents)),
    ),
    cardLargeFeeDividendCents: sumCents(
      wageDividends.map((record) => record.cardLargeFeeDividendCents),
    ),
    cardTipDividendCents: sumCents(
      records.map(
        (record) => cents(record.cardTipCents) + cents(record.giftCardTipCents ?? 0n),
      ),
    ),
  };
}

export interface PayrollBalance {
  rawBalanceCents: bigint;
  employerOwesCents: Cents;
  overpaidCents: Cents;
}

export function calculatePayrollBalance(input: {
  cumulativeEmployeeIncomeCents: Cents;
  settledCashAcquiredCents: Cents;
  payrollPaidCents: bigint;
}): PayrollBalance {
  const income = cents(input.cumulativeEmployeeIncomeCents);
  const cashAcquired = cents(input.settledCashAcquiredCents);
  const rawBalanceCents = income - cashAcquired - input.payrollPaidCents;

  return rawBalanceCents >= 0n
    ? {
        rawBalanceCents,
        employerOwesCents: rawBalanceCents,
        overpaidCents: 0n,
      }
    : {
        rawBalanceCents,
        employerOwesCents: 0n,
        overpaidCents: -rawBalanceCents,
      };
}

export function calculatePayrollPaymentTotal(input: {
  serviceWageCents: Cents;
  cashTipCents: Cents;
  cardTipCents: Cents;
  adjustmentCents: bigint;
}): bigint {
  return (
    cents(input.serviceWageCents) +
    cents(input.cashTipCents) +
    cents(input.cardTipCents) +
    input.adjustmentCents
  );
}
