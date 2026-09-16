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

/** Show US numbers without the country code; preserve invalid input for validation. */
export function displayUsPhone(value: string | null | undefined): string {
  const phone = value?.trim() ?? "";
  const digits = phone.replace(/[\s().-]/g, "");
  return /^\+1\d{10}$/.test(digits) ? digits.slice(2)
    : /^1\d{10}$/.test(digits) ? digits.slice(1) : digits;
}

export function usPhoneToE164(value: string): string {
  const digits = displayUsPhone(value);
  if (!/^\d{10}$/.test(digits)) throw new Error("请输入 10 位美国电话号码");
  return `+1${digits}`;
}
