export function giftCardSerialNumberForCreate(
  serialNumber: string,
  wasEdited: boolean,
): string | undefined {
  const trimmed = serialNumber.trim();
  if (!trimmed) throw new Error("请填写礼物卡序列号");
  return wasEdited ? trimmed : undefined;
}
