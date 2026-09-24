import { formatUsd } from "./money";

export function giftCardSerialNumberForCreate(
  serialNumber: string,
  wasEdited: boolean,
): string | undefined {
  const trimmed = serialNumber.trim();
  if (!trimmed) throw new Error("请填写礼物卡序列号");
  return wasEdited ? trimmed : undefined;
}

/** Display the discount from actual receipts; the saved pricing-rule snapshot stays intact. */
export function giftCardActualDiscount(faceValueCents: number, receivedCents: number): string {
  if (faceValueCents <= 0 || receivedCents >= faceValueCents) return "无折扣";
  const discountCents = faceValueCents - receivedCents;
  const percent = (discountCents / faceValueCents * 100).toFixed(2).replace(/\.?0+$/, "");
  return `折扣 ${percent}% · -${formatUsd(discountCents)}`;
}
