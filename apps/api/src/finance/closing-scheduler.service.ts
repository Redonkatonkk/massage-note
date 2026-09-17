import { ConflictException, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service.js";
import { ClosingsService } from "./closings.service.js";

export function scheduledClosingDate(now: Date, timezone: string): string | null {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) => parts.find(part => part.type === type)!.value;
  return value("hour") === "23" && value("minute") === "30"
    ? `${value("year")}-${value("month")}-${value("day")}` : null;
}

@Injectable()
export class ClosingSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ClosingSchedulerService.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly closings: ClosingsService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), 15_000);
    this.timer.unref();
    void this.tick();
  }

  onModuleDestroy() { clearInterval(this.timer); }

  async tick(now = new Date()) {
    if (this.running) return;
    this.running = true;
    try {
      const stores = await this.prisma.store.findMany({
        where: { status: "ACTIVE", deletedAt: null },
        select: { id: true, timezone: true, ownerMembership: {
          select: { status: true, deletedAt: true, user: true },
        } },
      });
      for (const store of stores) {
        try {
          const date = scheduledClosingDate(now, store.timezone);
          if (!date) continue;
          const owner = store.ownerMembership;
          if (!owner || owner.status !== "ACTIVE" || owner.deletedAt || owner.user?.status !== "ACTIVE") continue;
          await this.closings.close(owner.user, store.id, date, { force: false },
            `automatic-closing:${date}`, `automatic-closing:${store.id}:${date}`, true);
        } catch (error) {
          if (error instanceof ConflictException) {
            const response = error.getResponse();
            const code = typeof response === "object" && "code" in response ? response.code : null;
            if (["BUSINESS_DAY_ALREADY_CLOSED", "AUTOMATIC_CLOSING_ALREADY_PROCESSED", "CLOSING_WARNINGS_REQUIRE_FORCE"].includes(String(code))) continue;
          }
          // Do not log exception payloads: they may contain financial or recipient data.
          this.logger.error(`Automatic closing failed for store ${store.id}`);
        }
      }
    } catch {
      this.logger.error("Unable to scan stores for automatic closing");
    } finally { this.running = false; }
  }
}
