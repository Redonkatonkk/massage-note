import { describe, expect, it } from "vitest";
import { PasswordService } from "../src/auth/password.service.js";

describe("登录密码", () => {
  const service = new PasswordService();

  it("使用随机盐保存并验证密码", async () => {
    const first = await service.hash("secure-pass-123");
    const second = await service.hash("secure-pass-123");
    expect(first).not.toBe(second);
    await expect(service.verify("secure-pass-123", first)).resolves.toBe(true);
    await expect(service.verify("wrong-pass-123", first)).resolves.toBe(false);
  });

  it("安全拒绝损坏的密码摘要", async () => {
    await expect(service.verify("secure-pass-123", "not-a-valid-hash")).resolves.toBe(false);
  });
});
