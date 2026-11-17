import { lockBusinessDay } from "../common/business-day-lock.js";
import { claimedDeliveryWhere, deliveryFailureState, requireDeliveryLease } from "./delivery-lease.js";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { authenticateDeliveryAgent, hashDeliveryAgentToken } from "./delivery-agent.js";
import { clearDeliveryReceipt, deliveryReceiptData, receiptCandidatesWhere, receiptCandidateSelect, receiptCandidateOrder, recordDeliveryReceipt } from "./delivery-receipt.js";
import type { ClosingDeliveryReceiptInput, MessagesReceipt } from "@massage-note/contracts";
import {
  CLOSING_DELIVERY_TEXT_PROTOCOL,
  DAILY_SNAPSHOT_TTL_MS,
  dailySnapshotMonthToDateSchema,
  type PreparedClosingText,
} from "@massage-note/contracts";
import { businessDateFor } from "@massage-note/domain";
import { isE164Phone } from "./delivery-recipient.js";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma, type User } from "@massage-note/database";
import type {
  ClosingAgentHeartbeatInput,
  ClosingDeliveryFailureInput,
} from "@massage-note/contracts";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";
import { ClosingsService } from "./closings.service.js";
import { readSnapshotMonthToDate, snapshotDateOnly } from "./daily-snapshot-earnings.js";
import { hashDailySnapshotToken, publicDailySnapshot } from "./daily-snapshot-shares.service.js";

const dateAtUtc = (date: string) => new Date(`${date}T00:00:00.000Z`);

function dailySnapshotLink(token: string) {
  try {
    const production = process.env.NODE_ENV === "production";
    const origin = new URL(process.env.WEB_ORIGIN ?? (production ? "" : "http://localhost:3000"));
    const localHttp = !production && origin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname);
    if ((origin.protocol !== "https:" && !localHttp) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) {
      throw new Error("Unsupported Web origin");
    }
    const link = new URL("/share/daily-snapshot", origin);
    link.hash = token;
    return link.href;
  } catch {
    throw new ServiceUnavailableException({ code: "DAILY_SNAPSHOT_ORIGIN_INVALID", messageZh: "快照网页地址配置无效" });
  }
}

@Injectable()
export class ClosingDeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoreAccessService,
    private readonly closings: ClosingsService,
  ) {}

  async list(actor: User, storeId: string, businessDate: string) {
    await this.access.requireCapability(actor.id, storeId, "DAY_CLOSE_MANAGE");
    const [deliveries, agent, activeClosing] = await Promise.all([
      this.prisma.employeeClosingDelivery.findMany({
        where: { storeId, businessDate: dateAtUtc(businessDate) },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, closingId: true, membershipId: true, kind: true, status: true,
          recipientPhoneE164: true, locale: true, attemptCount: true,
          lastErrorCode: true, lastError: true, sentAt: true, createdAt: true,
          deliveryStatus: true, deliveryMessageGuid: true, deliveryErrorCode: true, deliveryService: true, deliveryCheckedAt: true,
          nextAttemptAt: true, updatedAt: true,
          closing: { select: { cycleNo: true, status: true } },
          membership: { select: { displayName: true } },
        },
      }),
      this.prisma.closingDeliveryAgent.findUnique({
        where: { storeId },
        select: { tokenPrefix: true, lastSeenAt: true, lastStatusJson: true, revokedAt: true },
      }),
      this.prisma.businessDayClosing.findFirst({
        where: { storeId, businessDate: dateAtUtc(businessDate), status: "CLOSED" },
        select: { id: true },
      }),
    ]);
    const previousCycleSent = activeClosing
      ? deliveries.some((item) => item.kind === "INITIAL" && item.status === "SENT" && item.closingId !== activeClosing.id)
      : false;
    return {
      deliveries,
      agent,
      batchAllowed: Boolean(activeClosing) && !previousCycleSent,
      batchBlockedReason: previousCycleSent ? "已有旧日结周期的小结发出；当前周期只允许逐人补发" : null,
    };
  }

  async queueBatch(actor: User, storeId: string, businessDate: string, requestId: string) {
    const actorMembership = await this.access.requireCapability(actor.id, storeId, "DAY_CLOSE_MANAGE");
    const closing = await this.activeClosing(storeId, businessDate);
    const previousSent = await this.prisma.employeeClosingDelivery.count({
      where: {
        storeId,
        kind: "INITIAL",
        status: "SENT",
        closing: { businessDate: dateAtUtc(businessDate), id: { not: closing.id } },
      },
    });
    if (previousSent > 0) {
      throw new ConflictException({
        code: "CLOSING_BATCH_ALREADY_SENT_BEFORE_RECLOSE",
        messageZh: "这个营业日已有员工小结发出；重新日结后请在个人日结中逐人补发",
      });
    }
    const totals = (closing.totalsSnapshotJson as { employees?: Array<{ membershipId: string; recordCount: number }> }).employees ?? [];
    const ids = totals.filter((item) => item.recordCount > 0).map((item) => item.membershipId);
    const members = await this.prisma.storeMembership.findMany({
      where: { id: { in: ids }, storeId, status: "ACTIVE", deletedAt: null },
      include: { user: { select: { phoneE164: true } }, store: { select: { closingDefaultLocale: true } } },
    });
    const skipped: Array<{ membershipId: string; displayName: string; reason: string }> = [];
    const eligible = members.flatMap((member) => {
      const phone = member.closingDeliveryPhoneE164 ?? member.user?.phoneE164 ?? null;
      if (!member.closingDeliveryEnabled) {
        skipped.push({ membershipId: member.id, displayName: member.displayName, reason: "未开启接收个人日结" });
        return [];
      }
      if (!isE164Phone(phone)) {
        skipped.push({ membershipId: member.id, displayName: member.displayName, reason: "没有有效接收号码" });
        return [];
      }
      return [{ member, phone, locale: member.closingImageLocale ?? member.store.closingDefaultLocale }];
    });
    const created = await this.prisma.$transaction(async (transaction) => {
      await lockBusinessDay(transaction, storeId, businessDate);
      const stillClosed = await transaction.businessDayClosing.findFirst({ where: { id: closing.id, storeId, status: "CLOSED" } });
      if (!stillClosed) throw new ConflictException({ code: "CLOSING_REQUIRED_FOR_DELIVERY", messageZh: "日结状态已变化，请刷新后重试" });
      const rows = [];
      for (const item of eligible) {
        const existing = await transaction.employeeClosingDelivery.findFirst({
          where: { storeId, closingId: closing.id, membershipId: item.member.id, kind: "INITIAL", requestKey: "initial" },
        });
        if (existing) {
          if (existing.status === "QUEUED" && !isE164Phone(existing.recipientPhoneE164)) {
            rows.push(await transaction.employeeClosingDelivery.update({
              where: { id: existing.id },
              data: { recipientPhoneE164: item.phone, lastErrorCode: null, lastError: null },
            }));
          } else {
            rows.push(existing);
          }
          continue;
        }
        const snapshot = await this.closings.buildDeliverySnapshot(actor, storeId, businessDate, item.member.id, transaction);
        const delivery = await transaction.employeeClosingDelivery.upsert({
          where: { storeId_closingId_membershipId_kind_requestKey: { storeId, closingId: closing.id, membershipId: item.member.id, kind: "INITIAL", requestKey: "initial" } },
          update: {},
          create: {
            storeId, businessDate: dateAtUtc(businessDate), closingId: closing.id, membershipId: item.member.id, kind: "INITIAL",
            recipientPhoneE164: item.phone, locale: item.locale,
            snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
            queuedBy: actor.id, requestKey: "initial",
          },
        });
        await transaction.auditLog.create({
          data: {
            storeId, actorUserId: actor.id, actorMembershipId: actorMembership.id,
            source: "api", action: "employee_closing.delivery_queued", entityType: "employee_closing_delivery",
            entityId: delivery.id, businessDate: closing.businessDate,
            afterJson: { membershipId: item.member.id, closingId: closing.id, kind: "INITIAL", locale: item.locale },
            requestId,
          },
        });
        rows.push(delivery);
      }
      return rows;
    }, { timeout: 20_000 });
    return { queuedCount: created.length, skippedCount: skipped.length, skipped, deliveries: created };
  }

  async queueMember(actor: User, storeId: string, businessDate: string, membershipId: string, requestKey: string, requestId: string) {
    const actorMembership = await this.access.requireCapability(actor.id, storeId, "DAY_CLOSE_MANAGE");
    const member = await this.prisma.storeMembership.findFirst({
      where: { id: membershipId, storeId, status: "ACTIVE", deletedAt: null },
      include: { user: { select: { phoneE164: true } }, store: { select: { closingDefaultLocale: true } } },
    });
    if (!member) throw new NotFoundException({ code: "CLOSING_MEMBERSHIP_NOT_FOUND", messageZh: "没有找到这位在职员工" });
    if (!member.closingDeliveryEnabled) throw new ConflictException({ code: "CLOSING_DELIVERY_DISABLED", messageZh: "这位员工尚未开启接收个人日结" });
    const phone = member.closingDeliveryPhoneE164 ?? member.user?.phoneE164;
    if (!isE164Phone(phone)) throw new ConflictException({ code: "CLOSING_DELIVERY_PHONE_MISSING", messageZh: "这位员工没有有效接收号码" });
    return this.prisma.$transaction(async (transaction) => {
      await lockBusinessDay(transaction, storeId, businessDate);
      const existing = await transaction.employeeClosingDelivery.findFirst({
        where: { storeId, businessDate: dateAtUtc(businessDate), membershipId, kind: "RESEND", requestKey },
      });
      if (existing) {
        if (existing.status === "QUEUED" && !isE164Phone(existing.recipientPhoneE164)) {
          return transaction.employeeClosingDelivery.update({
            where: { id: existing.id },
            data: { recipientPhoneE164: phone, lastErrorCode: null, lastError: null },
          });
        }
        return existing;
      }
      const snapshot = await this.closings.buildDeliverySnapshot(actor, storeId, businessDate, membershipId, transaction);
      const delivery = await transaction.employeeClosingDelivery.create({
        data: {
          storeId, businessDate: dateAtUtc(businessDate), closingId: snapshot.activeClosing?.id ?? null, membershipId, kind: "RESEND",
          recipientPhoneE164: phone,
          locale: member.closingImageLocale ?? member.store.closingDefaultLocale,
          snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
          queuedBy: actor.id, requestKey,
        },
      });
      await transaction.auditLog.create({
        data: {
          storeId, actorUserId: actor.id, actorMembershipId: actorMembership.id,
          source: "api", action: "employee_closing.delivery_queued", entityType: "employee_closing_delivery",
          entityId: delivery.id, businessDate: dateAtUtc(businessDate),
          afterJson: { membershipId, closingId: delivery.closingId, kind: "RESEND", locale: delivery.locale }, requestId,
        },
      });
      return delivery;
    }, { timeout: 20_000 });
  }

  async cancel(actor: User, storeId: string, businessDate: string, deliveryId: string, requestId: string) {
    const actorMembership = await this.access.requireCapability(actor.id, storeId, "DAY_CLOSE_MANAGE");
    const delivery = await this.prisma.employeeClosingDelivery.findFirst({
      where: {
        id: deliveryId,
        storeId,
        businessDate: dateAtUtc(businessDate),
      },
      include: { closing: { select: { businessDate: true } } },
    });
    if (!delivery) {
      throw new NotFoundException({
        code: "CLOSING_DELIVERY_NOT_FOUND",
        messageZh: "没有找到这条员工日结短信任务",
      });
    }
    if (delivery.status !== "QUEUED") {
      throw new ConflictException({
        code: "CLOSING_DELIVERY_NOT_CANCELLABLE",
        messageZh: "只有仍在排队、尚未交给信息 App 的任务可以取消",
      });
    }
    return this.prisma.$transaction(async (transaction) => {
      const cancelled = await transaction.employeeClosingDelivery.updateMany({
        where: { id: delivery.id, status: "QUEUED" },
        data: {
          status: "CANCELLED",
          leaseToken: null,
          leaseExpiresAt: null,
          lastErrorCode: "CANCELLED_BY_MANAGER",
          lastError: "店主或经理已取消发送",
        },
      });
      if (cancelled.count !== 1) {
        throw new ConflictException({
          code: "CLOSING_DELIVERY_NOT_CANCELLABLE",
          messageZh: "任务状态刚刚发生变化，请刷新后再检查",
        });
      }
      const updated = await transaction.employeeClosingDelivery.findUniqueOrThrow({
        where: { id: delivery.id },
      });
      await transaction.auditLog.create({
        data: {
          storeId,
          actorUserId: actor.id,
          actorMembershipId: actorMembership.id,
          source: "api",
          action: "employee_closing.delivery_cancelled",
          entityType: "employee_closing_delivery",
          entityId: delivery.id,
          businessDate: delivery.businessDate,
          afterJson: { membershipId: delivery.membershipId, status: "CANCELLED" },
          requestId,
        },
      });
      return updated;
    });
  }

  async rotateAgentCredential(actor: User, storeId: string, requestId: string) {
    const membership = await this.access.requireCapability(actor.id, storeId, "STORE_SETTINGS_MANAGE");
    const secret = randomBytes(32).toString("base64url");
    const prefix = randomBytes(5).toString("hex");
    const token = `mna_${prefix}_${secret}`;
    const agent = await this.prisma.closingDeliveryAgent.upsert({
      where: { storeId },
      create: { storeId, tokenHash: hashDeliveryAgentToken(token), tokenPrefix: prefix, createdBy: actor.id },
      update: { tokenHash: hashDeliveryAgentToken(token), tokenPrefix: prefix, revokedAt: null, lastSeenAt: null, lastStatusJson: Prisma.DbNull, createdBy: actor.id },
    });
    await this.prisma.auditLog.create({
      data: { storeId, actorUserId: actor.id, actorMembershipId: membership.id, source: "api", action: "closing_delivery.agent_credential_rotated", entityType: "closing_delivery_agent", entityId: agent.id, requestId },
    });
    return { token, tokenPrefix: prefix };
  }

  async agentStatus(actor: User, storeId: string) {
    await this.access.requireCapability(actor.id, storeId, "STORE_SETTINGS_MANAGE");
    return this.prisma.closingDeliveryAgent.findUnique({
      where: { storeId },
      select: { tokenPrefix: true, lastSeenAt: true, lastStatusJson: true, revokedAt: true, createdAt: true },
    });
  }

  async revokeAgentCredential(actor: User, storeId: string, requestId: string) {
    const membership = await this.access.requireCapability(actor.id, storeId, "STORE_SETTINGS_MANAGE");
    const agent = await this.prisma.closingDeliveryAgent.findUnique({ where: { storeId } });
    if (!agent) return { revoked: false };
    await this.prisma.closingDeliveryAgent.update({ where: { id: agent.id }, data: { revokedAt: new Date() } });
    await this.prisma.auditLog.create({
      data: { storeId, actorUserId: actor.id, actorMembershipId: membership.id, source: "api", action: "closing_delivery.agent_credential_revoked", entityType: "closing_delivery_agent", entityId: agent.id, requestId },
    });
    return { revoked: true };
  }

  async claim(authorization: string | undefined, protocol?: string) {
    const agent = await authenticateDeliveryAgent(this.prisma, authorization);
    await this.prisma.closingDeliveryAgent.update({ where: { id: agent.id }, data: { lastSeenAt: new Date() } });
    if (protocol !== CLOSING_DELIVERY_TEXT_PROTOCOL) return null;
    for (let checked = 0; checked < 100; checked += 1) {
      const now = new Date();
      const candidate = await this.prisma.employeeClosingDelivery.findFirst({
        where: {
          storeId: agent.storeId,
          nextAttemptAt: { lte: now },
          OR: [{ status: "QUEUED" }, { status: "CLAIMED", leaseExpiresAt: { lt: now } }],
        },
        orderBy: { createdAt: "asc" },
      });
      if (!candidate) return null;
      const claimableWhere = {
        id: candidate.id,
        OR: [{ status: "QUEUED" as const }, { status: "CLAIMED" as const, leaseExpiresAt: { lt: now } }],
      };
      if (!isE164Phone(candidate.recipientPhoneE164)) {
        const rejected = await this.prisma.employeeClosingDelivery.updateMany({
          where: claimableWhere,
          data: {
            status: "FAILED",
            leaseToken: null,
            leaseExpiresAt: null,
            lastErrorCode: "RECIPIENT_PHONE_INVALID",
            lastError: "接收号码为空或不是有效的 E.164 号码，请完善成员号码后人工补发",
          },
        });
        if (rejected.count === 1) {
          await this.prisma.auditLog.create({
            data: {
              storeId: candidate.storeId,
              actorUserId: null,
              actorMembershipId: null,
              source: "messages_agent",
              action: "employee_closing.delivery_rejected",
              entityType: "employee_closing_delivery",
              entityId: candidate.id,
              afterJson: { status: "FAILED", errorCode: "RECIPIENT_PHONE_INVALID" },
              requestId: `agent:${candidate.id}:invalid-phone`,
            },
          });
        }
        continue;
      }
      const leaseToken = randomUUID();
      const updated = await this.prisma.employeeClosingDelivery.updateMany({
        where: claimableWhere,
        data: { ...clearDeliveryReceipt, status: "CLAIMED", leaseToken, leaseExpiresAt: new Date(now.getTime() + 5 * 60_000), attemptCount: { increment: 1 } },
      });
      if (updated.count !== 1) continue;
      const job = await this.prisma.employeeClosingDelivery.findUniqueOrThrow({
        where: { id: candidate.id },
        select: { id: true, recipientPhoneE164: true, locale: true, kind: true, closing: { select: { cycleNo: true } } },
      });
      return { id: job.id, leaseToken, phoneE164: job.recipientPhoneE164, locale: job.locale, kind: job.kind, cycleNo: job.closing?.cycleNo ?? 0, deliveryMode: "TEXT" as const };
    }
    return null;
  }

  async authorize(authorization: string | undefined, deliveryId: string, leaseToken: string) {
    const agent = await authenticateDeliveryAgent(this.prisma, authorization);
    const job = await this.findClaimed(agent.storeId, deliveryId, leaseToken);
    if (job.closing && job.closing.status !== "CLOSED") {
      await this.prisma.employeeClosingDelivery.updateMany({ where: claimedDeliveryWhere(agent.storeId, job.id, leaseToken), data: { status: "CANCELLED", leaseToken: null, leaseExpiresAt: null } });
      return { authorized: false };
    }
    return { authorized: true };
  }

  async prepareText(authorization: string | undefined, deliveryId: string, leaseToken: string): Promise<PreparedClosingText> {
    const agent = await authenticateDeliveryAgent(this.prisma, authorization);
    const claimed = await this.findClaimed(agent.storeId, deliveryId, leaseToken);
    // Derive the same unguessable token on retries. The authenticated agent's
    // secret stays out of the database, and each delivery has its own token.
    const credential = authorization!.match(/^Bearer\s+(.+)$/i)![1]!;
    const token = createHmac("sha256", credential).update(`daily-snapshot:v1:${deliveryId}`).digest("base64url");
    const tokenHash = hashDailySnapshotToken(token);
    const link = dailySnapshotLink(token);
    return this.prisma.$transaction(async tx => {
      const businessDate = snapshotDateOnly(claimed.businessDate);
      await lockBusinessDay(tx, agent.storeId, businessDate);
      const where = claimedDeliveryWhere(agent.storeId, deliveryId, leaseToken);
      // Hold the task row for the remaining checks and grant insert.
      requireDeliveryLease(await tx.employeeClosingDelivery.updateMany({ where, data: { leaseToken } }));
      const job = await tx.employeeClosingDelivery.findUniqueOrThrow({
        where: { id: deliveryId },
        include: {
          closing: { select: { status: true } },
          store: { select: { status: true, deletedAt: true, timezone: true, businessCutoffLocal: true } },
          membership: { include: { user: { select: { phoneE164: true } } } },
          snapshotShare: { select: { tokenHash: true, expiresAt: true } },
        },
      });
      const { membership, store } = job;
      const now = new Date();
      const phone = membership.closingDeliveryPhoneE164 ?? membership.user?.phoneE164;
      const currentDay = businessDateFor({ startAt: now, timezone: store.timezone, cutoffLocal: store.businessCutoffLocal });
      if ((job.closing && job.closing.status !== "CLOSED") || store.status !== "ACTIVE" || store.deletedAt
        || membership.storeId !== job.storeId || membership.status !== "ACTIVE" || membership.deletedAt
        || !membership.closingDeliveryEnabled || !isE164Phone(phone) || phone !== job.recipientPhoneE164 || businessDate > currentDay) {
        await tx.employeeClosingDelivery.update({ where: { id: job.id }, data: {
          status: "CANCELLED", leaseToken: null, leaseExpiresAt: null,
          lastErrorCode: "SNAPSHOT_RECIPIENT_UNAVAILABLE", lastError: "接收资格、号码或营业日已变化，请核对后重新发送",
        } });
        return { authorized: false };
      }
      const snapshot = publicDailySnapshot(job.snapshotJson);
      if (job.snapshotShare) {
        // An earlier attempt may have submitted this link even if its response
        // was lost. Keep the original grant and expiry intact.
        if (job.snapshotShare.tokenHash !== tokenHash || job.snapshotShare.expiresAt <= now) {
          throw new ConflictException({ code: "DAILY_SNAPSHOT_PREPARE_EXPIRED", messageZh: "此任务原链接无法再次发送，请重新排队补发" });
        }
      } else {
        const saved = dailySnapshotMonthToDateSchema.safeParse((job.snapshotJson as { monthToDate?: unknown }).monthToDate);
        const monthToDate = saved.success
          ? saved.data
          : await readSnapshotMonthToDate(tx, job.storeId, job.membershipId, businessDate, snapshot.employee);
        await tx.employeeDailySnapshotShare.create({ data: {
          deliveryId, tokenHash, expiresAt: new Date(now.getTime() + DAILY_SNAPSHOT_TTL_MS), monthToDateJson: monthToDate,
        } });
      }
      const en = job.locale === "en_US";
      const amount = new Intl.NumberFormat(en ? "en-US" : "zh-CN", { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol" })
        .format(snapshot.employee.confirmedIncomeCents / 100);
      const name = snapshot.employee.displayName.replace(/[\r\n\u000b\u000c\u0085\u2028\u2029]+/g, " ").trim();
      const lines = en
        ? [`Name: ${name}`, `Date: ${businessDate}`, `Today's total earnings: ${amount}`, `Details: ${link}`]
        : [`名字：${name}`, `日期：${businessDate}`, `今日总收入：${amount}`, `详情页面：${link}`];
      return { authorized: true, text: lines.join("\n") };
    });
  }

  async complete(authorization: string | undefined, deliveryId: string, leaseToken: string, receipt?: MessagesReceipt) {
    const agent = await authenticateDeliveryAgent(this.prisma, authorization);
    const job = await this.findClaimed(agent.storeId, deliveryId, leaseToken);
    const sentAt = new Date();
    await this.prisma.$transaction(async (transaction) => {
      requireDeliveryLease(await transaction.employeeClosingDelivery.updateMany({ where: claimedDeliveryWhere(agent.storeId, job.id, leaseToken), data: { ...(receipt ? deliveryReceiptData(receipt) : {}), status: "SENT", sentAt, leaseToken: null, leaseExpiresAt: null, lastError: null, lastErrorCode: null } }));
      await transaction.auditLog.create({ data: { storeId: job.storeId, actorUserId: null, actorMembershipId: null, source: "messages_agent", action: "employee_closing.delivery_sent", entityType: "employee_closing_delivery", entityId: job.id, businessDate: job.businessDate, afterJson: { membershipId: job.membershipId, sentAt: sentAt.toISOString() }, requestId: `agent:${job.id}` } });
    });
    return { sent: true, sentAt };
  }

  async receiptCandidates(authorization: string | undefined) {
    const agent = await authenticateDeliveryAgent(this.prisma, authorization);
    const rows = await this.prisma.employeeClosingDelivery.findMany({
      where: receiptCandidatesWhere(agent.storeId),
      select: { ...receiptCandidateSelect, deliveryMessageGuid: true, snapshotShare: { select: { deliveryId: true } } },
      orderBy: receiptCandidateOrder, take: 20,
    });
    return rows.map(({ snapshotShare, ...row }) => ({ ...row, deliveryMode: snapshotShare ? "TEXT" as const : "IMAGE" as const }));
  }

  async receipt(authorization: string | undefined, deliveryId: string, input: ClosingDeliveryReceiptInput) {
    const agent = await authenticateDeliveryAgent(this.prisma, authorization);
    return this.prisma.$transaction(transaction => recordDeliveryReceipt(transaction, "closing", agent.storeId, deliveryId, input));
  }

  async fail(authorization: string | undefined, deliveryId: string, input: ClosingDeliveryFailureInput) {
    const agent = await authenticateDeliveryAgent(this.prisma, authorization);
    const job = await this.findClaimed(agent.storeId, deliveryId, input.leaseToken);
    const { data, retryScheduled } = deliveryFailureState(job.attemptCount, input);
    requireDeliveryLease(await this.prisma.employeeClosingDelivery.updateMany({
      where: claimedDeliveryWhere(agent.storeId, job.id, input.leaseToken),
      data,
    }));
    return { retryScheduled };
  }

  async heartbeat(authorization: string | undefined, input: ClosingAgentHeartbeatInput) {
    const agent = await authenticateDeliveryAgent(this.prisma, authorization);
    const lastSeenAt = new Date();
    await this.prisma.closingDeliveryAgent.update({ where: { id: agent.id }, data: { lastSeenAt, lastStatusJson: input as unknown as Prisma.InputJsonValue } });
    return { ok: true, lastSeenAt };
  }

  private async activeClosing(storeId: string, businessDate: string) {
    const closing = await this.prisma.businessDayClosing.findFirst({ where: { storeId, businessDate: dateAtUtc(businessDate), status: "CLOSED" } });
    if (!closing) throw new ConflictException({ code: "CLOSING_REQUIRED_FOR_DELIVERY", messageZh: "请先完成全店日结，再发送员工小结" });
    return closing;
  }

  private async findClaimed(storeId: string, deliveryId: string, leaseToken: string) {
    const job = await this.prisma.employeeClosingDelivery.findFirst({ where: claimedDeliveryWhere(storeId, deliveryId, leaseToken), include: { closing: true } });
    if (!job) throw new ForbiddenException({ code: "DELIVERY_LEASE_INVALID", messageZh: "发送任务租约无效或已经过期" });
    return job;
  }
}
