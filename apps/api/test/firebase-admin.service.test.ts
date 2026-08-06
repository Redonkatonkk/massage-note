import { NotFoundException, UnauthorizedException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FirebaseAdminService } from "../src/auth/firebase-admin.service.js";

const originalNodeEnv = process.env.NODE_ENV;
const originalEnabled = process.env.DEV_AUTH_ENABLED;
const originalSecret = process.env.DEV_AUTH_SECRET;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

describe("本地开发登录", () => {
  beforeEach(() => {
    process.env.NODE_ENV = "development";
    process.env.DEV_AUTH_ENABLED = "true";
    process.env.DEV_AUTH_SECRET = "unit-test-development-secret-at-least-32-characters";
  });

  afterEach(() => {
    restore("NODE_ENV", originalNodeEnv);
    restore("DEV_AUTH_ENABLED", originalEnabled);
    restore("DEV_AUTH_SECRET", originalSecret);
  });

  it("签发并校验带签名和过期时间的本地会话", async () => {
    const service = new FirebaseAdminService();
    const created = service.createDevelopmentSession("+14701234567");
    const verified = await service.verifySession(created.cookie);
    expect(verified.phone_number).toBe("+14701234567");
    expect(verified.uid).toMatch(/^dev-/);
  });

  it("拒绝被篡改的本地会话", async () => {
    const service = new FirebaseAdminService();
    const created = service.createDevelopmentSession("+14701234567");
    await expect(
      service.verifySession(`${created.cookie.slice(0, -1)}x`),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("生产环境始终禁用本地登录", () => {
    process.env.NODE_ENV = "production";
    const service = new FirebaseAdminService();
    expect(() => service.createDevelopmentSession("+14701234567")).toThrow(
      NotFoundException,
    );
  });
});
