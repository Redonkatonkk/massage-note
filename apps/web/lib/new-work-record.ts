import type { WorkRecord } from "./types";

/** An unsaved editor model; opening or closing it never writes a work record. */
export function newWorkRecord(input: Pick<WorkRecord,
  "employeeMembershipId" | "businessDate" | "storeTimezoneSnapshot" | "businessCutoffSnapshot" |
  "startAt" | "isHighlighted" | "isDispatchExcluded"
>): WorkRecord {
  return {
    id: "new", version: 1, status: "PENDING_PAYMENT", deletedAt: null,
    endAt: new Date(Date.parse(input.startAt) + 60 * 60_000).toISOString(), actualDurationMinutes: 60,
    mainServiceAmountCents: 0, addonTotalCents: 0, grossFeeBaseCents: 0, discountTotalCents: 0,
    discountedFeePerformanceCents: 0, mainServiceWageCents: 0, addonWageCents: 0, totalLargeFeeWageCents: 0,
    cashServiceCents: null, cardServiceCents: null, giftCardServiceCents: null, giftCardSerialNumber: null,
    cashTipCents: null, cardTipCents: null, giftCardTipCents: null, totalTipCents: null,
    actualServiceCollectedCents: null, customerTotalPaidCents: null, paymentDifferenceCents: null, employeeTotalIncomeCents: null,
    tipSettledManualFlag: false, largeFeeSettledManualFlag: false, automaticDiscountSuppressed: false, note: "",
    serviceSnapshot: null, addonSnapshots: [], discountSnapshots: [], payment: null,
    ...input,
  };
}
