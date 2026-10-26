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

  it("所有实收为零时保持待结账", () => {
    expect(shouldConfirmPaymentOnSave({ ...emptyPayment, cashService: "0" })).toBe(false);
  });

  it("只要开始填写付款或小费，就会校验并确认付款", () => {
    expect(shouldConfirmPaymentOnSave({ ...emptyPayment, cardTip: "10" })).toBe(true);
    expect(shouldConfirmPaymentOnSave({ ...emptyPayment, usesGiftCard: true })).toBe(false);
  });

  it("已确认记录清零后也回到待结账", () => {
    expect(shouldConfirmPaymentOnSave({ ...emptyPayment, status: "CONFIRMED" })).toBe(false);
  });

  it("四项零值格式与空白均待结账，礼物卡实收和非法输入仍进入校验", () => {
    expect(shouldConfirmPaymentOnSave({ ...emptyPayment, status: "CONFIRMED", cashService: "0.00", cardService: " 0 ", cashTip: "0.0", cardTip: "" })).toBe(false);
    expect(shouldConfirmPaymentOnSave({ ...emptyPayment, usesGiftCard: true, giftCardService: "50" })).toBe(true);
    expect(shouldConfirmPaymentOnSave({ ...emptyPayment, giftCardService: "50" })).toBe(false);
    for (const cashService of ["-1", "wrong", "0.000", ".0"]) expect(shouldConfirmPaymentOnSave({ ...emptyPayment, cashService })).toBe(true);
  });

  it("只标记已确认且实收服务费与应收不一致的记录", () => {
    expect(hasConfirmedPaymentMismatch("CONFIRMED", 100)).toBe(true);
    expect(hasConfirmedPaymentMismatch("CONFIRMED", -100)).toBe(true);
    expect(hasConfirmedPaymentMismatch("CONFIRMED", 0)).toBe(false);
    expect(hasConfirmedPaymentMismatch("PENDING_PAYMENT", 100)).toBe(false);
    expect(hasConfirmedPaymentMismatch("CONFIRMED", null)).toBe(false);
  });
});
