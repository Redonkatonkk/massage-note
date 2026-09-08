import { expect, it, vi } from "vitest";
import { AuthController } from "../src/auth/auth.controller.js";

it("空登录请求返回校验错误", async () => {
  const controller = new AuthController({} as never, {} as never);
  expect(() => controller.accountStatus(null as never)).toThrow();
  await expect(controller.passwordLogin(null as never)).rejects.toMatchObject({ status: 400 });
  await expect(controller.createSession(null as never, {} as never, {} as never)).rejects.toMatchObject({ status: 400 });
});

it.each(["password123", 1, true])("首次密码设置拒绝非对象输入 %s", async (passwordSetup) => {
  const firebase = { createSession: vi.fn().mockResolvedValue({ decodedToken: { phone_number: "+13105551234" } }) };
  const identities = { accountStatus: vi.fn().mockResolvedValue({ exists: true, hasPassword: false }), syncFromFirebase: vi.fn().mockResolvedValue({ id: "user" }) };
  const controller = new AuthController(firebase as never, identities as never);
  await expect(controller.createSession({ idToken: "token", csrfToken: "csrf", passwordSetup }, { headers: { cookie: "massage_csrf=csrf" } } as never, {} as never)).rejects.toMatchObject({ response: { code: "PASSWORD_SETUP_REQUIRED" }, status: 400 });
});
