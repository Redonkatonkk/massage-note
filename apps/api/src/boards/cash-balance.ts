import { Prisma, type Store } from "@massage-note/database";
import { calculateCashBalance, calculateCashChange, cashResetDate } from "@massage-note/domain";

export function savedCashChange(snapshot: Prisma.JsonValue | undefined): number | null {
  const store = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot.store : null;
  const change = store && typeof store === "object" && !Array.isArray(store) ? store.cashChangeCents : null;
  return typeof change === "number" && Number.isSafeInteger(change) ? change : null;
}

export type CashSettings = Pick<Store, "cashSettlementEnabled" | "cashSettlementCycle" | "cashResetWeekday" | "cashResetMonthDay" | "cashResetAmountCents">;

/** Called in a repeatable-read transaction so closing a skipped day cannot count it twice. */
export async function readCashBalance(client: Prisma.TransactionClient, storeId: string, businessDate: string, settings: CashSettings) {
  const resetDate = cashResetDate(businessDate, settings.cashSettlementCycle, settings.cashResetWeekday, settings.cashResetMonthDay);
  const range = { gte: new Date(resetDate), lte: new Date(businessDate) };
  const closings = await client.businessDayClosing.findMany({
    where: { storeId, businessDate: range, status: "CLOSED" },
    orderBy: { cycleNo: "desc" },
    distinct: ["businessDate"],
    select: { businessDate: true, totalsSnapshotJson: true },
  });
  const missingClosingDates: string[] = [];
  const changes: bigint[] = [];
  for (const closing of closings) {
    const change = savedCashChange(closing.totalsSnapshotJson);
    if (change === null) missingClosingDates.push(closing.businessDate.toISOString().slice(0, 10));
    else changes.push(BigInt(change));
  }
  const result = { enabled: true, resetDate, balanceCents: null as number | null, missingClosingDates: missingClosingDates.sort() };
  if (missingClosingDates.length) return result;
  const businessDates = { ...range, notIn: closings.map(closing => closing.businessDate) };
  const [records, giftSales] = await Promise.all([
    client.workRecord.findMany({
      where: { storeId, businessDate: businessDates, status: "CONFIRMED", deletedAt: null },
      select: { cashServiceCents: true, cashAllocatedServiceWageCents: true, totalLargeFeeWageCents: true,
        cardTipCents: true, giftCardTipCents: true, employee: { select: { role: true, dailySettlementEnabled: true } } },
    }),
    client.giftCardSale.aggregate({ where: { storeId, businessDate: businessDates, deletedAt: null }, _sum: { cashCents: true } }),
  ]);
  changes.push(calculateCashChange({
    giftCardSaleCashCents: giftSales._sum.cashCents ?? 0n,
    records: records.map(record => ({ ...record, ...record.employee,
      cashServiceCents: record.cashServiceCents ?? 0n,
      cashAllocatedServiceWageCents: record.cashAllocatedServiceWageCents ?? 0n,
      cardTipCents: record.cardTipCents ?? 0n, giftCardTipCents: record.giftCardTipCents ?? 0n,
    })),
  }));
  const balance = calculateCashBalance(settings.cashResetAmountCents, changes);
  const balanceCents = Number(balance);
  if (!Number.isSafeInteger(balanceCents)) throw new RangeError("现金余额超出安全整数范围");
  return { ...result, balanceCents };
}
