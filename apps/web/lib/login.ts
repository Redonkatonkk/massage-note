export function normalizeUsPhoneDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  return (digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits).slice(0, 10);
}

/** An expired cached identity should fall back to password/SMS login. Other errors remain visible. */
export function isExpiredLoginCredential(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return ["INVALID_FIREBASE_TOKEN", "auth/user-token-expired", "auth/invalid-user-token", "auth/user-disabled", "auth/user-not-found"].includes(String(error.code));
}
