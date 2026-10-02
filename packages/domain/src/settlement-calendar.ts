export type SettlementScope = "CASH" | "NON_CASH" | "ALL";

export interface SettlementDayIncome {
  businessDate: string;
  cashIncomeCents: bigint;
  nonCashIncomeCents: bigint;
  hasCash: boolean;
  hasNonCash: boolean;
}

export interface SettlementRangeConfirmation {
  periodStart: string;
  periodEnd: string;
  paymentScope: SettlementScope;
}

/** Confirmation is an explicit business decision, independent of payment amount. */
export function calculateSettlementDays(
  incomes: SettlementDayIncome[],
  confirmations: SettlementRangeConfirmation[],
  cashSettlements: Array<{ businessDate: string; cashRetainedCents: bigint; dailySettlementEnabled?: boolean }>,
) {
  const cashByDate = new Map(cashSettlements.map((item) => [item.businessDate, item.cashRetainedCents]));
  const fullByDate = new Set(cashSettlements.filter((item) => item.dailySettlementEnabled).map((item) => item.businessDate));
  return incomes.map((day) => {
    const covering = confirmations.filter((item) => item.periodStart <= day.businessDate && item.periodEnd >= day.businessDate);
    const cashConfirmed = fullByDate.has(day.businessDate) || covering.some((item) => item.paymentScope !== "NON_CASH");
    const nonCashConfirmed = fullByDate.has(day.businessDate) || covering.some((item) => item.paymentScope !== "CASH");
    const cashAcquired = cashByDate.get(day.businessDate) ?? 0n;
    const cashRemaining = day.cashIncomeCents - cashAcquired;
    return {
      businessDate: day.businessDate,
      dailySettlementEnabled: fullByDate.has(day.businessDate),
      hasCash: day.hasCash,
      hasNonCash: day.hasNonCash,
      cashConfirmed,
      nonCashConfirmed,
      cashSettled: day.hasCash && (cashConfirmed || cashByDate.has(day.businessDate)),
      nonCashSettled: day.hasNonCash && nonCashConfirmed,
      cashUnsettledCents: cashConfirmed ? 0n : cashRemaining > 0n ? cashRemaining : 0n,
      nonCashUnsettledCents: nonCashConfirmed ? 0n : day.nonCashIncomeCents,
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
