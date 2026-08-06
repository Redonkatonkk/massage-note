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
  cashTipCents: Cents;
  cardTipCents: Cents;
}

export interface WorkRecordFinance {
  mainServiceAmountCents: Cents;
  addonTotalCents: Cents;
  grossFeeBaseCents: Cents;
  discountTotalCents: Cents;
  discountedFeePerformanceCents: Cents;
  cashServiceCents: Cents;
  cardServiceCents: Cents;
  actualServiceCollectedCents: Cents;
  paymentDifferenceCents: bigint;
  cashTipCents: Cents;
  cardTipCents: Cents;
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
  const cashTipCents = cents(input.cashTipCents);
  const cardTipCents = cents(input.cardTipCents);

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
  const actualServiceCollectedCents = cashServiceCents + cardServiceCents;
  const totalTipCents = cashTipCents + cardTipCents;
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
    actualServiceCollectedCents,
    paymentDifferenceCents,
    cashTipCents,
    cardTipCents,
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
