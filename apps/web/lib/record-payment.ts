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

export function shouldConfirmPaymentOnSave(payment: PaymentDraftState): boolean {
  const amounts = [payment.cashService, payment.cardService, payment.cashTip, payment.cardTip,
    ...(payment.usesGiftCard ? [payment.giftCardService, payment.giftCardTip] : [])];
  // Invalid nonempty amounts still enter the validation flow rather than being silently ignored.
  return amounts.some((value) => {
    const text = value.trim();
    return text !== "" && (!/^\d+(?:\.\d{0,2})?$/.test(text) || Number(text) !== 0);
  });
}

export function hasConfirmedPaymentMismatch(
  status: WorkRecord["status"],
  paymentDifferenceCents: number | null,
): boolean {
  return status === "CONFIRMED" &&
    paymentDifferenceCents !== null &&
    paymentDifferenceCents !== 0;
}
