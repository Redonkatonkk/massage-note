import { describe, expect, it } from "vitest";
import { updatePasswordSchema } from "../src/index.js";

describe("个人密码契约", () => {
  it("允许无旧密码账号首次设置密码", () => {
    expect(updatePasswordSchema.safeParse({ newPassword: "new-pass-123" }).success).toBe(true);
  });

  it("拒绝过短密码和与旧密码相同的新密码", () => {
    expect(updatePasswordSchema.safeParse({ newPassword: "short" }).success).toBe(false);
    expect(updatePasswordSchema.safeParse({ currentPassword: "same-pass-123", newPassword: "same-pass-123" }).success).toBe(false);
  });
});
