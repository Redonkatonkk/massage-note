import { Prisma, type Store } from "@massage-note/database";
import { calculateCashBalance, cashResetDate } from "@massage-note/domain";

export function savedCashChange(snapshot: Prisma.JsonValue | undefined): number | null {
  const store = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? snapshot.store : null;
  const change = store && typeof store === "object" && !Array.isArray(store) ? store.cashChangeCents : null;
  return typeof change === "number" && Number.isSafeInteger(change) ? change : null;
}

export type CashSettings = Pick<Store, "cashSettlementEnabled" | "cashSettlementCycle" | "cashResetWeekday" | "cashResetMonthDay" | "cashResetAmountCents">;

/** Read receipts and posted payouts at the same point in time. */
export async function readCashBalance(client: Prisma.TransactionClient, storeId: string, businessDate: string, settings: CashSettings) {
  const resetDate = cashResetDate(businessDate, settings.cashSettlementCycle, settings.cashResetWeekday, settings.cashResetMonthDay);
  const businessDateRange = { gte: new Date(resetDate), lte: new Date(businessDate) };
  const scope = { storeId, businessDate: businessDateRange, deletedAt: null };
  const [services, giftSales, settlements] = await Promise.all([
    client.workRecord.aggregate({
      where: { ...scope, status: "CONFIRMED" },
      _sum: { cashServiceCents: true },
    }),
    client.giftCardSale.aggregate({ where: scope, _sum: { cashCents: true } }),
    client.dailyCashSettlement.findMany({
      where: { ...scope, status: "SETTLED", membership: { role: "EMPLOYEE" } },
      select: {
        dailySettlementEnabled: true,
        cashAcquiredServiceWageCents: true,
        additionalServiceWagePaidCents: true,
        nonCashTipPaidCents: true,
      },
    }),
  ]);
  const paid = settlements.reduce((total, settlement) => total + settlement.cashAcquiredServiceWageCents
    + (settlement.dailySettlementEnabled ? settlement.additionalServiceWagePaidCents + settlement.nonCashTipPaidCents : 0n), 0n);
  const balance = calculateCashBalance(settings.cashResetAmountCents, [
    services._sum.cashServiceCents ?? 0n, giftSales._sum.cashCents ?? 0n, -paid,
  ]);
  const balanceCents = Number(balance);
  if (!Number.isSafeInteger(balanceCents)) throw new RangeError("现金余额超出安全整数范围");
  return { enabled: true, resetDate, balanceCents, missingClosingDates: [] as string[] };
}
