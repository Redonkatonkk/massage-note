export function isE164Phone(phone: string | null | undefined): phone is string {
  return typeof phone === "string" && /^\+[1-9]\d{7,14}$/.test(phone);
}
