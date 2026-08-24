import type { WorkRecord } from "./types";

interface PaymentDraftState {
  status: WorkRecord["status"];
  cashService: string;
  cardService: string;
  usesGiftCard: boolean;
  giftCardSerialNumber: string;
  giftCardService: string;
  cashTip: string;
  cardTip: string;
  giftCardTip: string;
}

export function shouldConfirmPaymentOnSave({
  status,
  usesGiftCard,
  ...paymentFields
}: PaymentDraftState): boolean {
  if (status === "CONFIRMED" || usesGiftCard) return true;
  return Object.values(paymentFields).some((value) => value.trim() !== "");
}

export function hasConfirmedPaymentMismatch(
  status: WorkRecord["status"],
  paymentDifferenceCents: number | null,
): boolean {
  return status === "CONFIRMED" &&
    paymentDifferenceCents !== null &&
    paymentDifferenceCents !== 0;
}
