import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { dailyRankingText } from "@massage-note/domain";
import { lockBusinessDay } from "../common/business-day-lock.js";
import { dispatchDate, dispatchSmsClock } from "../common/dispatch-sms-time.js";
import { PrismaService } from "../database/prisma.service.js";
import { BoardsService } from "./boards.service.js";

@Injectable()
export class DispatchSmsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DispatchSmsScheduler.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly boards: BoardsService) {}

  onModuleInit() {
    this.timer = setInterval(() => void this.tick(), 15_000);
    this.timer.unref();
    void this.tick();
  }

  onModuleDestroy() { clearInterval(this.timer); }

  async tick(time?: Date) {
    if (this.running) return;
    this.running = true;
    try {
      const stores = await this.prisma.dispatchSmsSettings.findMany({
        where: { enabled: true, store: { status: "ACTIVE", deletedAt: null, automaticDispatchEnabled: true } },
        select: { storeId: true, startOnDate: true, sendTimeLocal: true, store: { select: { timezone: true } } },
      });
      for (const settings of stores) {
        try {
          const now = time ?? new Date();
          const clock = dispatchSmsClock(now, settings.store.timezone);
          const targetDate = dispatchDate(clock.targetDate);
          await this.prisma.dispatchSmsDelivery.updateMany({
            where: {
              storeId: settings.storeId, store: { timezone: settings.store.timezone },
              targetDate: { lt: targetDate }, dispatchStartedAt: null, status: { in: ["QUEUED", "CLAIMED"] },
            },
            data: { status: "CANCELLED", leaseToken: null, leaseExpiresAt: null, lastErrorCode: "EXPIRED" },
          });
          if (!settings.startOnDate || dispatchDate(clock.date) < settings.startOnDate || clock.time < settings.sendTimeLocal) continue;

          const where = { storeId_targetDate: { storeId: settings.storeId, targetDate } };
          if (await this.prisma.dispatchSmsDelivery.findUnique({ where, select: { id: true } })) continue;
          await this.prisma.$transaction(async tx => {
            await lockBusinessDay(tx, settings.storeId, clock.targetDate);
            await tx.$queryRaw`SELECT id FROM stores WHERE id = ${settings.storeId}::uuid FOR UPDATE`;
            if (await tx.dispatchSmsDelivery.findUnique({ where, select: { id: true } })) return;
            const store = await tx.store.findUnique({
              where: { id: settings.storeId, status: "ACTIVE", deletedAt: null, automaticDispatchEnabled: true },
              include: {
                dispatchSmsSettings: true,
                ownerMembership: { select: { status: true, deletedAt: true, user: { select: { id: true, status: true } } } },
              },
            });
            const current = store?.dispatchSmsSettings;
            if (!store || !current?.enabled || !current.phoneE164 || !current.startOnDate) return;
            const latestClock = dispatchSmsClock(time ?? new Date(), store.timezone);
            if (latestClock.targetDate !== clock.targetDate || dispatchDate(latestClock.date) < current.startOnDate || latestClock.time < current.sendTimeLocal) return;

            const owner = store.ownerMembership;
            const readyOwner = owner?.status === "ACTIVE" && !owner.deletedAt && owner.user?.status === "ACTIVE" ? owner.user : null;
            const prepared = readyOwner ? await this.boards.prepareWeeklyDispatch(
              tx, store, clock.targetDate, clock.date, { userId: readyOwner.id, membershipId: null },
              `dispatch-sms:${store.id}:${clock.targetDate}`,
            ) : null;
            const board = await tx.dailyBoard.findUnique({
              where: { storeId_businessDate: { storeId: store.id, businessDate: targetDate } },
              select: {
                id: true, rankedAt: true, rankingPending: true,
                rows: {
                  where: { isHidden: false },
                  orderBy: [{ position: "asc" }, { createdAt: "asc" }],
                  select: { isHidden: true, membership: { select: { displayName: true } } },
                },
              },
            });
            const ready = prepared?.rankingReady ?? (board && !board.rankingPending &&
              (board.rankedAt !== null || await this.boards.hasManualDispatchOrder(tx, store.id, board.id)));
            const body = ready && board
              ? board.rows.length === 0
                ? `${clock.targetDate}排工顺序\n明日暂无排工`
                : dailyRankingText(clock.targetDate, board.rows.map(row => ({
                  ...row, membership: { displayName: row.membership.displayName.replace(/[\u0000-\u001f\u0085\u2028\u2029]+/gu, " ").trim() },
                })))
              : null;
            const tooLong = body !== null && Buffer.byteLength(body) > 4096;
            await tx.dispatchSmsDelivery.create({
              data: {
                storeId: store.id, targetDate, recipientPhoneE164: current.phoneE164,
                createdAt: now, nextAttemptAt: now,
                body: tooLong ? null : body,
                status: tooLong ? "FAILED" : body ? "QUEUED" : "CANCELLED",
                lastErrorCode: tooLong ? "TEXT_TOO_LONG" : body ? null : "RANKING_NOT_READY",
              },
            });
          });
        } catch {
          this.logger.error(`Automatic dispatch SMS preparation failed for store ${settings.storeId}`);
        }
      }
    } catch {
      this.logger.error("Unable to scan stores for automatic dispatch SMS");
    } finally { this.running = false; }
  }
}
