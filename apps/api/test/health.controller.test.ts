import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/database/prisma.service.js";
import { HealthController } from "../src/health/health.controller.js";

describe("健康检查", () => {
  it("数据库可访问时返回就绪", async () => {
    const controller = new HealthController({
      ping: vi.fn().mockResolvedValue(undefined),
    } as unknown as PrismaService);

    await expect(controller.ready()).resolves.toMatchObject({
      status: "ready",
      database: "ok",
    });
  });

  it("数据库不可访问时返回服务不可用", async () => {
    const controller = new HealthController({
      ping: vi.fn().mockRejectedValue(new Error("offline")),
    } as unknown as PrismaService);

    await expect(controller.ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
