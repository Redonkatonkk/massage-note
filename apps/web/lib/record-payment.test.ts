import { describe, expect, it } from "vitest";
import {
  hasConfirmedPaymentMismatch,
  shouldConfirmPaymentOnSave,
} from "./record-payment";

const emptyPayment = {
  status: "PENDING_PAYMENT" as const,
  cashService: "",
  cardService: "",
  usesGiftCard: false,
  giftCardSerialNumber: "",
  giftCardService: "",
  cashTip: "",
  cardTip: "",
  giftCardTip: "",
};

describe("记工保存时的付款判断", () => {
  it("付款完全空白时只保存记工详情", () => {
    expect(shouldConfirmPaymentOnSave(emptyPayment)).toBe(false);
  });

  it("显式填写免费服务 0 时也会确认付款", () => {
    expect(shouldConfirmPaymentOnSave({ ...emptyPayment, cashService: "0" })).toBe(true);
  });

  it("只要开始填写付款或小费，就会校验并确认付款", () => {
    expect(shouldConfirmPaymentOnSave({ ...emptyPayment, cardTip: "10" })).toBe(true);
    expect(shouldConfirmPaymentOnSave({ ...emptyPayment, usesGiftCard: true })).toBe(true);
  });

  it("已确认记录再次保存时始终重新校验付款", () => {
    expect(shouldConfirmPaymentOnSave({ ...emptyPayment, status: "CONFIRMED" })).toBe(true);
  });

  it("只标记已确认且实收服务费与应收不一致的记录", () => {
    expect(hasConfirmedPaymentMismatch("CONFIRMED", 100)).toBe(true);
    expect(hasConfirmedPaymentMismatch("CONFIRMED", -100)).toBe(true);
    expect(hasConfirmedPaymentMismatch("CONFIRMED", 0)).toBe(false);
    expect(hasConfirmedPaymentMismatch("PENDING_PAYMENT", 100)).toBe(false);
    expect(hasConfirmedPaymentMismatch("CONFIRMED", null)).toBe(false);
  });
});
