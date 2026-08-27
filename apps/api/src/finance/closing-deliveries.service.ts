import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma, type User } from "@massage-note/database";
import type {
  ClosingAgentHeartbeatInput,
  ClosingDeliveryFailureInput,
} from "@massage-note/contracts";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";
import { ClosingsService } from "./closings.service.js";

const dateAtUtc = (date: string) => new Date(`${date}T00:00:00.000Z`);
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

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
        where: { storeId, closing: { businessDate: dateAtUtc(businessDate) } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true, closingId: true, membershipId: true, kind: true, status: true,
          recipientPhoneE164: true, locale: true, attemptCount: true,
          lastErrorCode: true, lastError: true, sentAt: true, createdAt: true,
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

  async queueBatch(actor: User, storeId: string, businessDate: string, requestKey: string, requestId: string) {
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
      if (!phone) {
        skipped.push({ membershipId: member.id, displayName: member.displayName, reason: "没有有效接收号码" });
        return [];
      }
      return [{ member, phone, locale: member.closingImageLocale ?? member.store.closingDefaultLocale }];
    });
    const created = await this.prisma.$transaction(async (transaction) => {
      const rows = [];
      for (const item of eligible) {
        const existing = await transaction.employeeClosingDelivery.findFirst({
          where: { storeId, closingId: closing.id, membershipId: item.member.id, kind: "INITIAL", requestKey: "initial" },
        });
        if (existing) { rows.push(existing); continue; }
        const snapshot = await this.closings.previewMember(actor, storeId, businessDate, item.member.id);
        const delivery = await transaction.employeeClosingDelivery.upsert({
          where: { storeId_closingId_membershipId_kind_requestKey: { storeId, closingId: closing.id, membershipId: item.member.id, kind: "INITIAL", requestKey: "initial" } },
          update: {},
          create: {
            storeId, closingId: closing.id, membershipId: item.member.id, kind: "INITIAL",
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
    });
    return { queuedCount: created.length, skippedCount: skipped.length, skipped, deliveries: created };
  }

  async queueMember(actor: User, storeId: string, businessDate: string, membershipId: string, requestKey: string, requestId: string) {
    const actorMembership = await this.access.requireCapability(actor.id, storeId, "DAY_CLOSE_MANAGE");
    const closing = await this.activeClosing(storeId, businessDate);
    const member = await this.prisma.storeMembership.findFirst({
      where: { id: membershipId, storeId, status: "ACTIVE", deletedAt: null },
      include: { user: { select: { phoneE164: true } }, store: { select: { closingDefaultLocale: true } } },
    });
    if (!member) throw new NotFoundException({ code: "CLOSING_MEMBERSHIP_NOT_FOUND", messageZh: "没有找到这位在职员工" });
    if (!member.closingDeliveryEnabled) throw new ConflictException({ code: "CLOSING_DELIVERY_DISABLED", messageZh: "这位员工尚未开启接收个人日结" });
    const phone = member.closingDeliveryPhoneE164 ?? member.user?.phoneE164;
    if (!phone) throw new ConflictException({ code: "CLOSING_DELIVERY_PHONE_MISSING", messageZh: "这位员工没有有效接收号码" });
    const existing = await this.prisma.employeeClosingDelivery.findFirst({
      where: { storeId, closingId: closing.id, membershipId, kind: "RESEND", requestKey },
    });
    if (existing) return existing;
    const snapshot = await this.closings.previewMember(actor, storeId, businessDate, membershipId);
    const delivery = await this.prisma.employeeClosingDelivery.upsert({
      where: { storeId_closingId_membershipId_kind_requestKey: { storeId, closingId: closing.id, membershipId, kind: "RESEND", requestKey } },
      update: {},
      create: {
        storeId, closingId: closing.id, membershipId, kind: "RESEND",
        recipientPhoneE164: phone,
        locale: member.closingImageLocale ?? member.store.closingDefaultLocale,
        snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
        queuedBy: actor.id, requestKey,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        storeId, actorUserId: actor.id, actorMembershipId: actorMembership.id,
        source: "api", action: "employee_closing.delivery_queued", entityType: "employee_closing_delivery",
        entityId: delivery.id, businessDate: closing.businessDate,
        afterJson: { membershipId, closingId: closing.id, kind: "RESEND", locale: delivery.locale }, requestId,
      },
    });
    return delivery;
  }

  async rotateAgentCredential(actor: User, storeId: string, requestId: string) {
    const membership = await this.access.requireCapability(actor.id, storeId, "STORE_SETTINGS_MANAGE");
    const secret = randomBytes(32).toString("base64url");
    const prefix = randomBytes(5).toString("hex");
    const token = `mna_${prefix}_${secret}`;
    const agent = await this.prisma.closingDeliveryAgent.upsert({
      where: { storeId },
      create: { storeId, tokenHash: tokenHash(token), tokenPrefix: prefix, createdBy: actor.id },
      update: { tokenHash: tokenHash(token), tokenPrefix: prefix, revokedAt: null, lastSeenAt: null, lastStatusJson: Prisma.DbNull, createdBy: actor.id },
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

  async claim(authorization: string | undefined) {
    const agent = await this.authenticateAgent(authorization);
    const now = new Date();
    const candidate = await this.prisma.employeeClosingDelivery.findFirst({
      where: {
        storeId: agent.storeId,
        nextAttemptAt: { lte: now },
        OR: [{ status: "QUEUED" }, { status: "CLAIMED", leaseExpiresAt: { lt: now } }],
      },
      orderBy: { createdAt: "asc" },
    });
    await this.prisma.closingDeliveryAgent.update({ where: { id: agent.id }, data: { lastSeenAt: now } });
    if (!candidate) return null;
    const leaseToken = randomUUID();
    const updated = await this.prisma.employeeClosingDelivery.updateMany({
      where: {
        id: candidate.id,
        OR: [{ status: "QUEUED" }, { status: "CLAIMED", leaseExpiresAt: { lt: now } }],
      },
      data: { status: "CLAIMED", leaseToken, leaseExpiresAt: new Date(now.getTime() + 5 * 60_000), attemptCount: { increment: 1 } },
    });
    if (updated.count !== 1) return null;
    const job = await this.prisma.employeeClosingDelivery.findUniqueOrThrow({ where: { id: candidate.id }, include: { closing: { select: { cycleNo: true } }, membership: { select: { displayName: true } } } });
    return { id: job.id, leaseToken, phoneE164: job.recipientPhoneE164, locale: job.locale, kind: job.kind, cycleNo: job.closing.cycleNo, displayName: job.membership.displayName, snapshot: job.snapshotJson };
  }

  async authorize(authorization: string | undefined, deliveryId: string, leaseToken: string) {
    const agent = await this.authenticateAgent(authorization);
    const job = await this.findClaimed(agent.storeId, deliveryId, leaseToken);
    if (job.closing.status !== "CLOSED") {
      await this.prisma.employeeClosingDelivery.update({ where: { id: job.id }, data: { status: "CANCELLED", leaseToken: null, leaseExpiresAt: null } });
      return { authorized: false };
    }
    return { authorized: true };
  }

  async complete(authorization: string | undefined, deliveryId: string, leaseToken: string) {
    const agent = await this.authenticateAgent(authorization);
    const job = await this.findClaimed(agent.storeId, deliveryId, leaseToken);
    const sentAt = new Date();
    await this.prisma.$transaction([
      this.prisma.employeeClosingDelivery.update({ where: { id: job.id }, data: { status: "SENT", sentAt, leaseToken: null, leaseExpiresAt: null, lastError: null, lastErrorCode: null } }),
      this.prisma.auditLog.create({ data: { storeId: job.storeId, actorUserId: null, actorMembershipId: null, source: "messages_agent", action: "employee_closing.delivery_sent", entityType: "employee_closing_delivery", entityId: job.id, businessDate: job.closing.businessDate, afterJson: { membershipId: job.membershipId, sentAt: sentAt.toISOString() }, requestId: `agent:${job.id}` } }),
    ]);
    return { sent: true, sentAt };
  }

  async fail(authorization: string | undefined, deliveryId: string, input: ClosingDeliveryFailureInput) {
    const agent = await this.authenticateAgent(authorization);
    const job = await this.findClaimed(agent.storeId, deliveryId, input.leaseToken);
    const retry = input.retryable && job.attemptCount < 3;
    await this.prisma.employeeClosingDelivery.update({
      where: { id: job.id },
      data: {
        status: retry ? "QUEUED" : "FAILED", leaseToken: null, leaseExpiresAt: null,
        nextAttemptAt: retry ? new Date(Date.now() + 30_000 * job.attemptCount) : new Date(),
        lastErrorCode: input.code, lastError: input.message,
      },
    });
    return { retryScheduled: retry };
  }

  async heartbeat(authorization: string | undefined, input: ClosingAgentHeartbeatInput) {
    const agent = await this.authenticateAgent(authorization);
    const lastSeenAt = new Date();
    await this.prisma.closingDeliveryAgent.update({ where: { id: agent.id }, data: { lastSeenAt, lastStatusJson: input as unknown as Prisma.InputJsonValue } });
    return { ok: true, lastSeenAt };
  }

  private async activeClosing(storeId: string, businessDate: string) {
    const closing = await this.prisma.businessDayClosing.findFirst({ where: { storeId, businessDate: dateAtUtc(businessDate), status: "CLOSED" } });
    if (!closing) throw new ConflictException({ code: "CLOSING_REQUIRED_FOR_DELIVERY", messageZh: "请先完成全店日结，再发送员工小结" });
    return closing;
  }

  private async authenticateAgent(authorization: string | undefined) {
    const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    const prefix = token?.match(/^mna_([a-f0-9]{10})_/)?.[1];
    if (!token || !prefix) throw new UnauthorizedException({ code: "DELIVERY_AGENT_TOKEN_REQUIRED", messageZh: "发送代理凭证无效" });
    const agent = await this.prisma.closingDeliveryAgent.findUnique({ where: { tokenPrefix: prefix } });
    const presentedHash = tokenHash(token);
    if (!agent || agent.revokedAt || agent.tokenHash.length !== presentedHash.length || !timingSafeEqual(Buffer.from(agent.tokenHash), Buffer.from(presentedHash))) throw new UnauthorizedException({ code: "DELIVERY_AGENT_TOKEN_INVALID", messageZh: "发送代理凭证无效或已撤销" });
    return agent;
  }

  private async findClaimed(storeId: string, deliveryId: string, leaseToken: string) {
    const job = await this.prisma.employeeClosingDelivery.findFirst({ where: { id: deliveryId, storeId, status: "CLAIMED", leaseToken }, include: { closing: true } });
    if (!job) throw new ForbiddenException({ code: "DELIVERY_LEASE_INVALID", messageZh: "发送任务租约无效或已经过期" });
    return job;
  }
}
