import type { Prisma, WorkRecord } from "@massage-note/database";
import { calculateDailyCashSettlement, calculateDailyFullSettlement } from "@massage-note/domain";

type SettlementAmountFields = Pick<WorkRecord,
  | "cashServiceCents" | "cashTipCents" | "cashAllocatedServiceWageCents"
  | "cashAcquiredServiceWageCents" | "cashWageShortfallCents"
  | "totalLargeFeeWageCents" | "cardTipCents" | "giftCardTipCents"
>;
type CashSettlementWorkRecord = SettlementAmountFields & Pick<WorkRecord,
  "businessDate" | "employeeMembershipId" | "deletedAt" | "status"
>;

export interface CashSettlementChange {
  before: CashSettlementWorkRecord | null;
  after: CashSettlementWorkRecord | null;
}

interface CashSettlementAudit {
  storeId: string;
  actorUserId: string | null;
  actorMembershipId: string;
  requestId: string;
  reason?: string;
}

export function cashSettlementRecordAmounts(record: SettlementAmountFields) {
  return {
    cashServiceCents: record.cashServiceCents ?? 0n,
    cashTipCents: record.cashTipCents ?? 0n,
    cashAllocatedServiceWageCents: record.cashAllocatedServiceWageCents ?? 0n,
    cashAcquiredServiceWageCents: record.cashAcquiredServiceWageCents ?? 0n,
    cashWageShortfallCents: record.cashWageShortfallCents ?? 0n,
    totalLargeFeeWageCents: record.totalLargeFeeWageCents,
    cardTipCents: record.cardTipCents ?? 0n,
    giftCardTipCents: record.giftCardTipCents ?? 0n,
  };
}

type RecordAmounts = ReturnType<typeof cashSettlementRecordAmounts>;
type SettlementScope = { membershipId: string; businessDate: Date };

function amountsDiffer<T extends object>(before: T, after: T) {
  return (Object.keys(before) as Array<keyof T>).some(key => before[key] !== after[key]);
}

export async function reopenChangedCashSettlements(
  transaction: Prisma.TransactionClient,
  audit: CashSettlementAudit,
  changes: readonly CashSettlementChange[],
  restoredSettlementIds: string[] = [],
) {
  const affected = new Map<string, { scope: SettlementScope; before: RecordAmounts[]; after: RecordAmounts[] }>();
  const scopeKey = ({ membershipId, businessDate }: SettlementScope) => `${membershipId}:${businessDate.toISOString()}`;
  for (const change of changes) {
    for (const side of ["before", "after"] as const) {
      const record = change[side];
      if (!record || record.deletedAt || record.status !== "CONFIRMED") continue;
      const scope = { membershipId: record.employeeMembershipId, businessDate: record.businessDate };
      const key = scopeKey(scope);
      const totals = affected.get(key) ?? { scope, before: [], after: [] };
      totals[side].push(cashSettlementRecordAmounts(record));
      affected.set(key, totals);
    }
  }
  if (!affected.size) return;

  const settlements = await transaction.dailyCashSettlement.findMany({
    where: {
      storeId: audit.storeId,
      status: "SETTLED",
      deletedAt: null,
      id: { notIn: restoredSettlementIds },
      OR: [...affected.values()].map(({ scope }) => scope),
    },
    select: { id: true, membershipId: true, businessDate: true, settledAt: true, version: true, dailySettlementEnabled: true },
  });
  for (const settlement of settlements) {
    const { before, after } = affected.get(scopeKey(settlement))!;
    // Day totals are additive. Unchanged records and intermediate saves cancel out.
    const cashChanged = amountsDiffer(calculateDailyCashSettlement(before), calculateDailyCashSettlement(after));
    const fullChanged = settlement.dailySettlementEnabled && amountsDiffer(
      calculateDailyFullSettlement(before), calculateDailyFullSettlement(after),
    );
    if (!cashChanged && !fullChanged) continue;

    const reopened = await transaction.dailyCashSettlement.update({
      where: { id: settlement.id },
      data: { status: "UNSETTLED", settledBy: null, settledAt: null, version: { increment: 1 } },
      select: { version: true },
    });
    await transaction.auditLog.create({
      data: {
        storeId: audit.storeId,
        actorUserId: audit.actorUserId,
        actorMembershipId: audit.actorMembershipId,
        requestId: audit.requestId,
        source: "system",
        action: "cash_settlement.reopened_automatically",
        entityType: "daily_cash_settlement",
        entityId: settlement.id,
        businessDate: settlement.businessDate,
        beforeJson: { status: "SETTLED", settledAt: settlement.settledAt?.toISOString() ?? null, version: settlement.version },
        afterJson: { status: "UNSETTLED", settledAt: null, version: reopened.version },
        reason: audit.reason ?? "员工当天应结金额发生变化，需要重新确认现金结算",
      },
    });
  }
}
