export type SettlementScope = "CASH" | "NON_CASH" | "ALL";
export type SettlementAmountType = "SERVICE" | "TIP" | "ALL";

export interface SettlementDayIncome {
  businessDate: string;
  cashIncomeCents: bigint;
  nonCashIncomeCents: bigint;
  cashTipCents?: bigint;
  nonCashTipCents?: bigint;
  hasCashService?: boolean;
  hasNonCashService?: boolean;
  hasCash: boolean;
  hasNonCash: boolean;
}

export interface SettlementRangeConfirmation {
  periodStart: string;
  periodEnd: string;
  paymentScope: SettlementScope;
  amountType?: SettlementAmountType;
}

/** Source and earnings type are confirmed independently, regardless of payment amount. */
export function calculateSettlementDays(
  incomes: SettlementDayIncome[],
  confirmations: SettlementRangeConfirmation[],
  cashSettlements: Array<{ businessDate: string; cashRetainedCents: bigint; cashTipCents?: bigint; dailySettlementEnabled?: boolean }>,
  amountType: SettlementAmountType = "ALL",
) {
  const cashByDate = new Map(cashSettlements.map((item) => [item.businessDate, item]));
  return incomes.map((day) => {
    const covering = confirmations.filter((item) => item.periodStart <= day.businessDate && item.periodEnd >= day.businessDate);
    const dailyCash = cashByDate.get(day.businessDate);
    const full = dailyCash?.dailySettlementEnabled ?? false;
    const confirmed = (scope: "CASH" | "NON_CASH", kind: "SERVICE" | "TIP") => full || covering.some((item) =>
      (item.paymentScope === "ALL" || item.paymentScope === scope) && (!item.amountType || item.amountType === "ALL" || item.amountType === kind));
    const cashTips = day.cashTipCents ?? 0n;
    const nonCashTips = day.nonCashTipCents ?? 0n;
    const cashWage = day.cashIncomeCents - cashTips;
    const nonCashWage = day.nonCashIncomeCents - nonCashTips;
    const acquiredTips = dailyCash?.cashTipCents ?? 0n;
    const acquiredWage = (dailyCash?.cashRetainedCents ?? 0n) - acquiredTips;
    const remaining = (income: bigint, acquired: bigint, isConfirmed: boolean) => isConfirmed ? 0n : income > acquired ? income - acquired : 0n;
    const cashServiceRemaining = remaining(cashWage, acquiredWage, confirmed("CASH", "SERVICE"));
    const cashTipRemaining = remaining(cashTips, acquiredTips, confirmed("CASH", "TIP"));
    const nonCashServiceRemaining = remaining(nonCashWage, 0n, confirmed("NON_CASH", "SERVICE"));
    const nonCashTipRemaining = remaining(nonCashTips, 0n, confirmed("NON_CASH", "TIP"));
    const selected = (wage: bigint, tips: bigint) => (amountType !== "TIP" ? wage : 0n) + (amountType !== "SERVICE" ? tips : 0n);
    const sourceConfirmed = (scope: "CASH" | "NON_CASH", wage: bigint, tips: bigint) =>
      (amountType === "TIP" || confirmed(scope, "SERVICE") || (amountType === "ALL" && wage === 0n && tips !== 0n)) &&
      (amountType === "SERVICE" || confirmed(scope, "TIP") || (amountType === "ALL" && tips === 0n && wage !== 0n));
    const cashConfirmed = sourceConfirmed("CASH", cashWage, cashTips);
    const nonCashConfirmed = sourceConfirmed("NON_CASH", nonCashWage, nonCashTips);
    const hasCash = amountType === "ALL" ? day.hasCash : amountType === "TIP" ? cashTips !== 0n : day.hasCashService ?? (cashWage !== 0n || (day.hasCash && cashTips === 0n));
    const hasNonCash = amountType === "ALL" ? day.hasNonCash : amountType === "TIP" ? nonCashTips !== 0n : day.hasNonCashService ?? (nonCashWage !== 0n || (day.hasNonCash && nonCashTips === 0n));
    return {
      businessDate: day.businessDate,
      dailySettlementEnabled: full,
      hasCash, hasNonCash, cashConfirmed, nonCashConfirmed,
      cashSettled: hasCash && (cashConfirmed || Boolean(dailyCash)),
      nonCashSettled: hasNonCash && nonCashConfirmed,
      cashUnsettledCents: selected(cashServiceRemaining, cashTipRemaining),
      nonCashUnsettledCents: selected(nonCashServiceRemaining, nonCashTipRemaining),
    };
  });
}

export function settlementUnsettledTotal(
  days: ReturnType<typeof calculateSettlementDays>,
  scope: SettlementScope,
): bigint {
  return days.reduce((sum, day) => sum
    + (scope !== "NON_CASH" ? day.cashUnsettledCents : 0n)
    + (scope !== "CASH" ? day.nonCashUnsettledCents : 0n), 0n);
}
