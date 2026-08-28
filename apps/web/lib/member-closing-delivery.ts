export const CLOSING_DELIVERY_PHONE_REQUIRED_MESSAGE =
  "此成员没有注册手机号，请先填写短信接收号码，再开启接收个人日结短信。";

export function effectiveClosingDeliveryPhone(
  dedicatedPhone: string | null | undefined,
  registeredPhone: string | null | undefined,
): string {
  return dedicatedPhone?.trim() || registeredPhone?.trim() || "";
}

export function validateClosingDeliveryPhone(
  enabled: boolean,
  dedicatedPhone: string | null | undefined,
  registeredPhone: string | null | undefined,
): string {
  const phone = effectiveClosingDeliveryPhone(dedicatedPhone, registeredPhone);
  if (enabled && !phone) throw new Error(CLOSING_DELIVERY_PHONE_REQUIRED_MESSAGE);
  return phone;
}
