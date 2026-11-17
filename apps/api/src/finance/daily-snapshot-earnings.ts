import type { DailySnapshot, DailySnapshotMonthToDate } from "@massage-note/contracts";
import type { Prisma } from "@massage-note/database";

export const snapshotDateAtUtc = (date: string) => new Date(`${date}T00:00:00.000Z`);
export const snapshotDateOnly = (date: Date) => date.toISOString().slice(0, 10);

export const snapshotEarningsFields = {
  totalLargeFeeWageCents: true,
  cashAllocatedServiceWageCents: true,
  cashTipCents: true,
  cardTipCents: true,
  giftCardTipCents: true,
} as const;

type EarningsSums = Record<keyof typeof snapshotEarningsFields, bigint | null>;

export function snapshotEarningsBySource(sums: EarningsSums) {
  // Match calculatePersonalClosingPaymentDividends and keep saved wage allocations.
  const cashWage = sums.cashAllocatedServiceWageCents ?? 0n;
  return {
    cash: cashWage + (sums.cashTipCents ?? 0n),
    nonCash: (sums.totalLargeFeeWageCents ?? 0n) - cashWage + (sums.cardTipCents ?? 0n) + (sums.giftCardTipCents ?? 0n),
  };
}

export function snapshotEarningsCents(cents: bigint): number {
  const value = Number(cents);
  if (!Number.isSafeInteger(value)) throw new RangeError("Daily snapshot earnings exceed safe integer cents");
  return value;
}

export function snapshotDayEarnings(employee: DailySnapshot["employee"]) {
  return {
    cash: BigInt(employee.cashLargeFeeDividendCents) + BigInt(employee.cashTipDividendCents),
    nonCash: BigInt(employee.cardLargeFeeDividendCents) + BigInt(employee.cardTipDividendCents),
  };
}

export async function readSnapshotMonthToDate(
  client: Prisma.TransactionClient,
  storeId: string,
  membershipId: string,
  dateTo: string,
  employee: DailySnapshot["employee"],
): Promise<DailySnapshotMonthToDate> {
  const dateFrom = `${dateTo.slice(0, 7)}-01`;
  const { _sum } = await client.workRecord.aggregate({
    where: {
      storeId, employeeMembershipId: membershipId, status: "CONFIRMED", deletedAt: null,
      // Add the selected snapshot's confirmed earnings separately.
      businessDate: { gte: snapshotDateAtUtc(dateFrom), lt: snapshotDateAtUtc(dateTo) },
    },
    _sum: snapshotEarningsFields,
  });
  const prior = snapshotEarningsBySource(_sum);
  const selected = snapshotDayEarnings(employee);
  const cash = prior.cash + selected.cash;
  const nonCash = prior.nonCash + selected.nonCash;
  return {
    dateFrom, dateTo,
    cashIncomeCents: snapshotEarningsCents(cash),
    nonCashIncomeCents: snapshotEarningsCents(nonCash),
    totalIncomeCents: snapshotEarningsCents(cash + nonCash),
  };
}
