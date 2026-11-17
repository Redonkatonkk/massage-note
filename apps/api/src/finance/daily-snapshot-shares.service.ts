import { createHash } from "node:crypto";
import { Injectable, NotFoundException } from "@nestjs/common";
import {
  dailySnapshotMonthToDateSchema,
  dailySnapshotTokenSchema,
  publicDailySnapshotSchema,
  type DailySnapshot,
  type DailySnapshotCalendar,
  type DailySnapshotResponse,
} from "@massage-note/contracts";
import { businessDateFor } from "@massage-note/domain";
import { Prisma } from "@massage-note/database";
import { PrismaService } from "../database/prisma.service.js";
import { ClosingsService } from "./closings.service.js";
import {
  readSnapshotMonthToDate, snapshotDateAtUtc, snapshotDateOnly, snapshotEarningsBySource,
  snapshotEarningsCents, snapshotEarningsFields,
} from "./daily-snapshot-earnings.js";

const unavailable = () => new NotFoundException({
  code: "DAILY_SNAPSHOT_UNAVAILABLE",
  messageZh: "快照链接已过期或不可用，请联系店铺重新发送",
});

export const hashDailySnapshotToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function publicDailySnapshot(value: unknown): DailySnapshot {
  const result = publicDailySnapshotSchema.safeParse(value);
  if (!result.success) throw unavailable();
  return result.data;
}

@Injectable()
export class DailySnapshotSharesService {
  constructor(private readonly prisma: PrismaService, private readonly closings: ClosingsService) {}

  async read(authorization: string | undefined, date: string | undefined): Promise<DailySnapshotResponse> {
    return this.prisma.$transaction(async tx => {
      const { share, minDate, maxDate } = await this.scope(tx, authorization);
      const selectedDate = date ?? maxDate;
      if (selectedDate < minDate || selectedDate > maxDate) throw unavailable();
      const { delivery } = share;
      const isAnchor = selectedDate === maxDate;
      const snapshot = isAnchor
        ? publicDailySnapshot(delivery.snapshotJson)
        : publicDailySnapshot(await this.closings.buildMemberPreview(delivery.storeId, selectedDate, delivery.membershipId, tx, false));
      const monthToDate = isAnchor
        ? dailySnapshotMonthToDateSchema.parse(share.monthToDateJson)
        : await readSnapshotMonthToDate(tx, delivery.storeId, delivery.membershipId, selectedDate, snapshot.employee);
      return { snapshot, monthToDate, minDate, maxDate, expiresAt: share.expiresAt.toISOString(), locale: delivery.locale };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  async calendar(authorization: string | undefined, month: string): Promise<DailySnapshotCalendar> {
    return this.prisma.$transaction(async tx => {
      const { share, minDate, maxDate } = await this.scope(tx, authorization);
      if (month < minDate.slice(0, 7) || month > maxDate.slice(0, 7)) throw unavailable();
      const { delivery } = share;
      const from = snapshotDateAtUtc(month === minDate.slice(0, 7) ? minDate : `${month}-01`);
      const nextMonth = snapshotDateAtUtc(`${month}-01`);
      nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
      const rows = await tx.workRecord.groupBy({
        by: ["businessDate", "status"],
        where: {
          storeId: delivery.storeId, employeeMembershipId: delivery.membershipId, status: { not: "PLACEHOLDER" }, deletedAt: null,
          businessDate: { gte: from, lte: delivery.businessDate, lt: nextMonth },
        },
        _sum: snapshotEarningsFields,
      });
      const amounts = new Map<string, number>();
      for (const row of rows) {
        const date = snapshotDateOnly(row.businessDate);
        if (row.status === "CONFIRMED") {
          const { cash, nonCash } = snapshotEarningsBySource(row._sum);
          amounts.set(date, snapshotEarningsCents(cash + nonCash));
        } else if (!amounts.has(date)) {
          amounts.set(date, 0);
        }
      }
      const closings = await tx.businessDayClosing.findMany({
        where: {
          storeId: delivery.storeId, status: "CLOSED",
          businessDate: { in: [...amounts.keys()].map(snapshotDateAtUtc) },
        },
        select: { businessDate: true },
      });
      const closed = new Set(closings.map(row => snapshotDateOnly(row.businessDate)));
      if (maxDate.startsWith(month)) {
        const anchor = publicDailySnapshot(delivery.snapshotJson);
        if (anchor.records.length || anchor.isClosed) amounts.set(maxDate, anchor.employee.confirmedIncomeCents);
        else amounts.delete(maxDate);
        if (anchor.isClosed) closed.add(maxDate);
        else closed.delete(maxDate);
      }
      const dates: string[] = [];
      const closedDates: DailySnapshotCalendar["closedDates"] = [];
      for (const [date, amount] of [...amounts.entries()].sort(([left], [right]) => left.localeCompare(right))) {
        if (closed.has(date)) closedDates.push({ date, revenueCents: amount });
        else dates.push(date);
      }
      return { dates, closedDates };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  }

  private async scope(tx: Prisma.TransactionClient, authorization: string | undefined) {
    const token = dailySnapshotTokenSchema.safeParse(authorization?.match(/^Bearer ([^ ]+)$/i)?.[1]);
    if (!token.success) throw unavailable();
    const now = new Date();
    const share = await tx.employeeDailySnapshotShare.findFirst({
      where: {
        tokenHash: hashDailySnapshotToken(token.data),
        expiresAt: { gt: now },
        delivery: {
          status: { not: "CANCELLED" },
          store: { status: "ACTIVE", deletedAt: null },
          membership: { status: "ACTIVE", deletedAt: null, closingDeliveryEnabled: true },
        },
      },
      select: {
        expiresAt: true, monthToDateJson: true,
        delivery: { select: {
          storeId: true, membershipId: true, businessDate: true, recipientPhoneE164: true, locale: true, snapshotJson: true,
          store: { select: { timezone: true, businessCutoffLocal: true } },
          membership: { select: { storeId: true, closingDeliveryPhoneE164: true, user: { select: { phoneE164: true } } } },
        } },
      },
    });
    if (!share) throw unavailable();
    const { delivery } = share;
    const { membership, store } = delivery;
    if (membership.storeId !== delivery.storeId || (membership.closingDeliveryPhoneE164 ?? membership.user?.phoneE164) !== delivery.recipientPhoneE164) {
      throw unavailable();
    }
    const maxDate = snapshotDateOnly(delivery.businessDate);
    if (maxDate > businessDateFor({ startAt: now, timezone: store.timezone, cutoffLocal: store.businessCutoffLocal })) throw unavailable();
    const first = await tx.workRecord.findFirst({
      where: {
        storeId: delivery.storeId, employeeMembershipId: delivery.membershipId, status: { not: "PLACEHOLDER" },
        deletedAt: null, businessDate: { lte: delivery.businessDate },
      },
      orderBy: { businessDate: "asc" },
      select: { businessDate: true },
    });
    return { share, minDate: first ? snapshotDateOnly(first.businessDate) : maxDate, maxDate };
  }
}
