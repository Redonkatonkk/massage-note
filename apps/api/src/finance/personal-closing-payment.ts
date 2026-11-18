import type { WorkRecord } from "@massage-note/database";
import type { PersonalClosingPaymentDividends, PersonalClosingPaymentRecord } from "@massage-note/domain";

export function personalClosingPaymentRecord(
  record: Pick<WorkRecord, keyof PersonalClosingPaymentRecord>,
): PersonalClosingPaymentRecord {
  return {
    totalLargeFeeWageCents: record.totalLargeFeeWageCents,
    cashAllocatedServiceWageCents: record.cashAllocatedServiceWageCents ?? 0n,
    cashServiceCents: record.cashServiceCents ?? 0n,
    cardServiceCents: record.cardServiceCents ?? 0n,
    cashTipCents: record.cashTipCents ?? 0n,
    cardTipCents: record.cardTipCents ?? 0n,
    giftCardTipCents: record.giftCardTipCents ?? 0n,
  };
}

export function personalClosingCashDue(
  dividends: PersonalClosingPaymentDividends,
  dailySettlementEnabled: boolean,
): bigint {
  const { cashLargeFeeDividendCents, cardLargeFeeDividendCents, cardTipDividendCents } = dividends;
  return dailySettlementEnabled
    ? cashLargeFeeDividendCents + cardLargeFeeDividendCents + cardTipDividendCents
    : cashLargeFeeDividendCents;
}
