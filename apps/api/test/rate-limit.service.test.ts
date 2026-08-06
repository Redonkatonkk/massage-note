import type { Request } from "express";
import { afterEach, describe, expect, it } from "vitest";
import { RateLimitService } from "../src/common/rate-limit.service.js";

const originalRedisUrl = process.env.REDIS_URL;

function request(path: string, method = "POST", ip = "203.0.113.10") {
  return { path, method, ip, socket: { remoteAddress: ip } } as Request;
}

describe("接口频率限制", () => {
  afterEach(() => {
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedisUrl;
  });

  it("登录请求超过窗口上限时返回中文 429 错误", async () => {
    delete process.env.REDIS_URL;
    const service = new RateLimitService();
    for (let index = 0; index < 10; index += 1) {
      await expect(service.check(request("/api/v1/auth/session"))).resolves.toBeUndefined();
    }
    await expect(service.check(request("/api/v1/auth/session"))).rejects.toMatchObject({
      status: 429,
      response: { code: "RATE_LIMITED", messageZh: "操作过于频繁，请稍后再试" },
    });
    await service.onModuleDestroy();
  });

  it("只读普通请求不计入写入频率窗口", async () => {
    delete process.env.REDIS_URL;
    const service = new RateLimitService();
    for (let index = 0; index < 150; index += 1) {
      await expect(service.check(request("/api/v1/stores/example", "GET"))).resolves.toBeUndefined();
    }
    await service.onModuleDestroy();
  });

  it("退出登录和审批加入申请不会误占登录或申请额度", async () => {
    delete process.env.REDIS_URL;
    const service = new RateLimitService();
    for (let index = 0; index < 20; index += 1) {
      await expect(service.check(request("/api/v1/auth/session", "DELETE"))).resolves.toBeUndefined();
      await expect(service.check(request("/api/v1/stores/store/join-requests/request/approve"))).resolves.toBeUndefined();
    }
    await service.onModuleDestroy();
  });
});
