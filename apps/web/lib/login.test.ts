import { describe, expect, it } from "vitest";
import { isExpiredLoginCredential, normalizeUsPhoneDigits } from "./login";

describe("login recovery", () => {
  it("accepts pasted US international numbers without dropping their last digit", () => {
    expect(normalizeUsPhoneDigits("+1 (470) 123-4567")).toBe("4701234567");
    expect(normalizeUsPhoneDigits("(470) 123-4567")).toBe("4701234567");
  });
  it("falls back only for rejected cached credentials, preserving network and setup errors", () => {
    expect(isExpiredLoginCredential({ code: "INVALID_FIREBASE_TOKEN" })).toBe(true);
    expect(isExpiredLoginCredential({ code: "auth/user-token-expired" })).toBe(true);
    for (const code of ["auth/network-request-failed", "PASSWORD_SETUP_REQUIRED", "REGISTRATION_REQUIRED", "FIREBASE_NOT_CONFIGURED"]) {
      expect(isExpiredLoginCredential({ code })).toBe(false);
    }
    expect(isExpiredLoginCredential(null)).toBe(false);
  });
});
