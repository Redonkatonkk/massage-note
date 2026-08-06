import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";

@Controller("health")
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  check(): {
    status: "ok";
    service: string;
    timestamp: string;
  } {
    return {
      status: "ok",
      service: "massage-note-api",
      timestamp: new Date().toISOString(),
    };
  }

  @Get("ready")
  async ready(): Promise<{
    status: "ready";
    service: string;
    database: "ok";
    timestamp: string;
  }> {
    try {
      await this.prisma.ping();
    } catch {
      throw new ServiceUnavailableException({
        code: "DATABASE_NOT_READY",
        messageZh: "数据库尚未就绪，请稍后重试",
      });
    }

    return {
      status: "ready",
      service: "massage-note-api",
      database: "ok",
      timestamp: new Date().toISOString(),
    };
  }
}
