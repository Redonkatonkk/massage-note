import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma, type User } from "@massage-note/database";
import type {
  ClosingDeliveryFailureInput,
  CreateEmployeeSettlementDeliveryInput,
  EmployeeSettlementPaymentScope,
  EmployeeSettlementQuery,
} from "@massage-note/contracts";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";

const dateAtUtc = (date: string) => new Date(`${date}T00:00:00.000Z`);
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
const isE164Phone = (phone: string | null | undefined): phone is string =>
  typeof phone === "string" && /^\+[1-9]\d{7,14}$/.test(phone);

@Injectable()
export class EmployeeSettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoreAccessService,
  ) {}

  async preview(actor: User, storeId: string, query: EmployeeSettlementQuery) {
    await this.access.requireCapability(actor.id, storeId, "PAYROLL_MANAGE");
    return this.buildPreview(storeId, query);
  }

  async listDeliveries(actor: User, storeId: string) {
    await this.access.requireCapability(actor.id, storeId, "PAYROLL_MANAGE");
    const [deliveries, agent] = await Promise.all([
      this.prisma.employeeSettlementDelivery.findMany({
        where: { storeId },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true, membershipId: true, periodStart: true, periodEnd: true,
          paymentScope: true, status: true, recipientPhoneE164: true, locale: true,
          attemptCount: true, summarySentAt: true, detailSentAt: true, sentAt: true,
          lastErrorCode: true, lastError: true, createdAt: true, updatedAt: true,
          membership: { select: { displayName: true } },
        },
      }),
      this.prisma.closingDeliveryAgent.findUnique({
        where: { storeId },
        select: { lastSeenAt: true, lastStatusJson: true, revokedAt: true },
      }),
    ]);
    return { deliveries, agent };
  }

  async queue(
    actor: User,
    storeId: string,
    input: CreateEmployeeSettlementDeliveryInput,
    requestKey: string,
    requestId: string,
  ) {
    const manager = await this.access.requireCapability(actor.id, storeId, "PAYROLL_MANAGE");
    const existing = await this.prisma.employeeSettlementDelivery.findUnique({
      where: { storeId_requestKey: { storeId, requestKey } },
    });
    if (existing) {
      const same = existing.membershipId === input.membershipId
        && dateOnly(existing.periodStart) === input.dateFrom
        && dateOnly(existing.periodEnd) === input.dateTo
        && existing.paymentScope === input.paymentScope;
      if (!same) throw new ConflictException({ code: "IDEMPOTENCY_KEY_REUSED", messageZh: "同一个请求键不能用于不同的员工结算范围" });
      return existing;
    }
    const member = await this.prisma.storeMembership.findFirst({
      where: { id: input.membershipId, storeId, status: "ACTIVE", deletedAt: null },
      include: { user: { select: { phoneE164: true } }, store: { select: { closingDefaultLocale: true } } },
    });
    if (!member) throw new NotFoundException({ code: "SETTLEMENT_MEMBERSHIP_NOT_FOUND", messageZh: "没有找到可结算的在职成员" });
    if (!member.closingDeliveryEnabled) throw new ConflictException({ code: "SETTLEMENT_DELIVERY_DISABLED", messageZh: "这位员工尚未开启接收结算短信" });
    const phone = member.closingDeliveryPhoneE164 ?? member.user?.phoneE164;
    if (!isE164Phone(phone)) throw new ConflictException({ code: "SETTLEMENT_DELIVERY_PHONE_MISSING", messageZh: "这位员工没有有效接收号码" });
    await this.assertAgentReady(storeId);
    const snapshot = await this.buildPreview(storeId, input);
    if (snapshot.records.length === 0) throw new ConflictException({ code: "SETTLEMENT_HAS_NO_RECORDS", messageZh: "当前范围没有可发送的已确认记工" });
    const delivery = await this.prisma.employeeSettlementDelivery.create({
      data: {
        storeId,
        membershipId: input.membershipId,
        periodStart: dateAtUtc(input.dateFrom),
        periodEnd: dateAtUtc(input.dateTo),
        paymentScope: input.paymentScope,
        recipientPhoneE164: phone,
        locale: member.closingImageLocale ?? member.store.closingDefaultLocale,
        snapshotJson: snapshot as unknown as Prisma.InputJsonValue,
        queuedBy: actor.id,
        requestKey,
      },
    });
    await this.prisma.auditLog.create({
      data: {
        storeId, actorUserId: actor.id, actorMembershipId: manager.id,
        source: "api", action: "employee_settlement.delivery_queued",
        entityType: "employee_settlement_delivery", entityId: delivery.id,
        afterJson: { membershipId: input.membershipId, dateFrom: input.dateFrom, dateTo: input.dateTo, paymentScope: input.paymentScope } as Prisma.InputJsonValue,
        requestId,
      },
    });
    return delivery;
  }

  async cancel(actor: User, storeId: string, deliveryId: string, requestId: string) {
    const manager = await this.access.requireCapability(actor.id, storeId, "PAYROLL_MANAGE");
    const changed = await this.prisma.employeeSettlementDelivery.updateMany({
      where: { id: deliveryId, storeId, status: "QUEUED" },
      data: { status: "CANCELLED", lastErrorCode: "CANCELLED_BY_MANAGER", lastError: "店主或经理已取消发送" },
    });
    if (changed.count !== 1) throw new ConflictException({ code: "SETTLEMENT_DELIVERY_NOT_CANCELLABLE", messageZh: "只有尚未交给信息 App 的排队任务可以取消" });
    await this.prisma.auditLog.create({ data: { storeId, actorUserId: actor.id, actorMembershipId: manager.id, source: "api", action: "employee_settlement.delivery_cancelled", entityType: "employee_settlement_delivery", entityId: deliveryId, requestId } });
    return this.prisma.employeeSettlementDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
  }

  async retry(actor: User, storeId: string, deliveryId: string, requestId: string) {
    const manager = await this.access.requireCapability(actor.id, storeId, "PAYROLL_MANAGE");
    await this.assertAgentReady(storeId);
    const changed = await this.prisma.employeeSettlementDelivery.updateMany({
      where: { id: deliveryId, storeId, status: "FAILED" },
      data: { status: "QUEUED", nextAttemptAt: new Date(), lastError: null, lastErrorCode: null, leaseToken: null, leaseExpiresAt: null },
    });
    if (changed.count !== 1) throw new ConflictException({ code: "SETTLEMENT_DELIVERY_NOT_RETRYABLE", messageZh: "只有失败的结算短信任务可以重试" });
    await this.prisma.auditLog.create({ data: { storeId, actorUserId: actor.id, actorMembershipId: manager.id, source: "api", action: "employee_settlement.delivery_retried", entityType: "employee_settlement_delivery", entityId: deliveryId, requestId } });
    return this.prisma.employeeSettlementDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
  }

  async retryDetail(actor: User, storeId: string, deliveryId: string, requestId: string) {
    const manager = await this.access.requireCapability(actor.id, storeId, "PAYROLL_MANAGE");
    await this.assertAgentReady(storeId);
    const changed = await this.prisma.employeeSettlementDelivery.updateMany({
      where: {
        id: deliveryId,
        storeId,
        status: { in: ["SENT", "FAILED"] },
      },
      data: {
        status: "QUEUED",
        detailSentAt: null,
        sentAt: null,
        nextAttemptAt: new Date(),
        lastError: null,
        lastErrorCode: null,
        leaseToken: null,
        leaseExpiresAt: null,
      },
    });
    if (changed.count !== 1) throw new ConflictException({ code: "SETTLEMENT_DETAIL_NOT_RETRYABLE", messageZh: "只有已完成或失败的结算任务可以重发长图" });
    await this.prisma.auditLog.create({
      data: {
        storeId,
        actorUserId: actor.id,
        actorMembershipId: manager.id,
        source: "api",
        action: "employee_settlement.delivery_detail_retried",
        entityType: "employee_settlement_delivery",
        entityId: deliveryId,
        afterJson: { attachment: "DETAIL", reason: "manager_requested_redelivery" },
        requestId,
      },
    });
    return this.prisma.employeeSettlementDelivery.findUniqueOrThrow({ where: { id: deliveryId } });
  }

  async claim(authorization: string | undefined) {
    const agent = await this.authenticateAgent(authorization);
    const now = new Date();
    const candidate = await this.prisma.employeeSettlementDelivery.findFirst({
      where: { storeId: agent.storeId, nextAttemptAt: { lte: now }, OR: [{ status: "QUEUED" }, { status: "CLAIMED", leaseExpiresAt: { lt: now } }] },
      orderBy: { createdAt: "asc" },
    });
    if (!candidate) return null;
    const leaseToken = randomUUID();
    const changed = await this.prisma.employeeSettlementDelivery.updateMany({
      where: { id: candidate.id, OR: [{ status: "QUEUED" }, { status: "CLAIMED", leaseExpiresAt: { lt: now } }] },
      data: { status: "CLAIMED", leaseToken, leaseExpiresAt: new Date(now.getTime() + 10 * 60_000), attemptCount: { increment: 1 } },
    });
    if (changed.count !== 1) return null;
    const job = await this.prisma.employeeSettlementDelivery.findUniqueOrThrow({ where: { id: candidate.id } });
    return {
      id: job.id, documentType: "RANGE_SETTLEMENT", leaseToken,
      phoneE164: job.recipientPhoneE164, locale: job.locale,
      detailSent: Boolean(job.detailSentAt),
      snapshot: job.snapshotJson,
    };
  }

  async authorize(authorization: string | undefined, deliveryId: string, leaseToken: string) {
    const agent = await this.authenticateAgent(authorization);
    await this.findClaimed(agent.storeId, deliveryId, leaseToken);
    return { authorized: true };
  }

  async checkpoint(authorization: string | undefined, deliveryId: string, leaseToken: string, attachment: "SUMMARY" | "DETAIL") {
    const agent = await this.authenticateAgent(authorization);
    const job = await this.findClaimed(agent.storeId, deliveryId, leaseToken);
    const sentAt = new Date();
    await this.prisma.employeeSettlementDelivery.update({
      where: { id: job.id },
      data: attachment === "SUMMARY" ? { summarySentAt: job.summarySentAt ?? sentAt } : { detailSentAt: job.detailSentAt ?? sentAt },
    });
    return { recorded: true, attachment, sentAt };
  }

  async complete(authorization: string | undefined, deliveryId: string, leaseToken: string) {
    const agent = await this.authenticateAgent(authorization);
    const job = await this.findClaimed(agent.storeId, deliveryId, leaseToken);
    if (!job.detailSentAt) throw new ConflictException({ code: "SETTLEMENT_ATTACHMENTS_INCOMPLETE", messageZh: "结算长图发送后才能完成任务" });
    const sentAt = new Date();
    await this.prisma.$transaction([
      this.prisma.employeeSettlementDelivery.update({ where: { id: job.id }, data: { status: "SENT", sentAt, leaseToken: null, leaseExpiresAt: null, lastError: null, lastErrorCode: null } }),
      this.prisma.auditLog.create({ data: { storeId: job.storeId, actorUserId: null, actorMembershipId: null, source: "messages_agent", action: "employee_settlement.delivery_sent", entityType: "employee_settlement_delivery", entityId: job.id, afterJson: { membershipId: job.membershipId, sentAt: sentAt.toISOString() }, requestId: `agent:settlement:${job.id}` } }),
    ]);
    return { sent: true, sentAt };
  }

  async fail(authorization: string | undefined, deliveryId: string, input: ClosingDeliveryFailureInput) {
    const agent = await this.authenticateAgent(authorization);
    const job = await this.findClaimed(agent.storeId, deliveryId, input.leaseToken);
    const retry = input.retryable && job.attemptCount < 3;
    await this.prisma.employeeSettlementDelivery.update({
      where: { id: job.id },
      data: { status: retry ? "QUEUED" : "FAILED", leaseToken: null, leaseExpiresAt: null, nextAttemptAt: retry ? new Date(Date.now() + 30_000 * job.attemptCount) : new Date(), lastErrorCode: input.code, lastError: input.message },
    });
    return { retryScheduled: retry };
  }

  private async buildPreview(storeId: string, query: EmployeeSettlementQuery) {
    const member = await this.prisma.storeMembership.findFirst({
      where: { id: query.membershipId, storeId, status: "ACTIVE", deletedAt: null },
      include: { store: { select: { name: true, timezone: true } } },
    });
    if (!member) throw new NotFoundException({ code: "SETTLEMENT_MEMBERSHIP_NOT_FOUND", messageZh: "没有找到可结算的在职成员" });
    const rows = await this.prisma.workRecord.findMany({
      where: { storeId, employeeMembershipId: member.id, businessDate: { gte: dateAtUtc(query.dateFrom), lte: dateAtUtc(query.dateTo) }, status: "CONFIRMED", deletedAt: null },
      orderBy: [{ businessDate: "asc" }, { startAt: "asc" }, { id: "asc" }],
      include: { serviceSnapshot: { select: { name: true, shortName: true } }, addonSnapshots: { orderBy: { position: "asc" }, select: { name: true, shortName: true } } },
    });
    const records = rows.map((record) => {
      const cashLargeFeeWageCents = record.cashAllocatedServiceWageCents ?? 0n;
      const nonCashLargeFeeWageCents = record.totalLargeFeeWageCents - cashLargeFeeWageCents;
      const cashTipCents = record.cashTipCents ?? 0n;
      const nonCashTipCents = (record.cardTipCents ?? 0n) + (record.giftCardTipCents ?? 0n);
      const cashIncomeCents = cashLargeFeeWageCents + cashTipCents;
      const nonCashIncomeCents = nonCashLargeFeeWageCents + nonCashTipCents;
      return {
        id: record.id, businessDate: dateOnly(record.businessDate), startAt: record.startAt.toISOString(), endAt: record.endAt?.toISOString() ?? null,
        serviceName: record.serviceSnapshot?.name ?? "自定义项目", serviceShortName: record.serviceSnapshot?.shortName ?? record.serviceSnapshot?.name ?? "自定义",
        addons: record.addonSnapshots,
        grossFeeBaseCents: this.safeNumber(record.grossFeeBaseCents),
        cashServiceCents: this.safeNumber(record.cashServiceCents ?? 0n),
        cardServiceCents: this.safeNumber(record.cardServiceCents ?? 0n),
        giftCardServiceCents: this.safeNumber(record.giftCardServiceCents ?? 0n),
        nonCashServiceCents: this.safeNumber((record.cardServiceCents ?? 0n) + (record.giftCardServiceCents ?? 0n)),
        cashLargeFeeWageCents: this.safeNumber(cashLargeFeeWageCents), nonCashLargeFeeWageCents: this.safeNumber(nonCashLargeFeeWageCents),
        cashTipCents: this.safeNumber(cashTipCents),
        cardTipCents: this.safeNumber(record.cardTipCents ?? 0n),
        giftCardTipCents: this.safeNumber(record.giftCardTipCents ?? 0n),
        nonCashTipCents: this.safeNumber(nonCashTipCents),
        cashIncomeCents: this.safeNumber(cashIncomeCents), nonCashIncomeCents: this.safeNumber(nonCashIncomeCents), totalIncomeCents: this.safeNumber(cashIncomeCents + nonCashIncomeCents),
      };
    }).filter((record) => this.includeRecord(record, query.paymentScope));
    if (records.length > 999) throw new BadRequestException({ code: "RECORD_LIMIT_EXCEEDED", messageZh: `当前范围有 ${records.length} 笔已确认记工，最多支持 999 笔，请缩短日期区间`, latestResource: { recordCount: records.length, limit: 999 } });
    const sum = (key: keyof (typeof records)[number]) => records.reduce((total, record) => total + (typeof record[key] === "number" ? record[key] as number : 0), 0);
    return {
      storeId, storeName: member.store.name, storeTimezone: member.store.timezone,
      dateFrom: query.dateFrom, dateTo: query.dateTo, paymentScope: query.paymentScope,
      employee: { membershipId: member.id, displayName: member.displayName },
      summary: {
        recordCount: records.length,
        cashServiceCents: sum("cashServiceCents"), nonCashServiceCents: sum("nonCashServiceCents"),
        cashLargeFeeWageCents: sum("cashLargeFeeWageCents"), nonCashLargeFeeWageCents: sum("nonCashLargeFeeWageCents"),
        cashTipCents: sum("cashTipCents"), nonCashTipCents: sum("nonCashTipCents"),
        cashIncomeCents: sum("cashIncomeCents"), nonCashIncomeCents: sum("nonCashIncomeCents"),
        totalIncomeCents: query.paymentScope === "CASH"
          ? sum("cashIncomeCents")
          : query.paymentScope === "NON_CASH"
            ? sum("nonCashIncomeCents")
            : sum("totalIncomeCents"),
      },
      records,
      generatedAt: new Date().toISOString(),
    };
  }

  private includeRecord(record: { cashServiceCents: number; nonCashServiceCents: number; cashTipCents: number; nonCashTipCents: number; cashIncomeCents: number; nonCashIncomeCents: number }, scope: EmployeeSettlementPaymentScope) {
    if (scope === "ALL") return true;
    if (scope === "CASH") return record.cashServiceCents !== 0 || record.cashTipCents !== 0 || record.cashIncomeCents !== 0;
    return record.nonCashServiceCents !== 0 || record.nonCashTipCents !== 0 || record.nonCashIncomeCents !== 0;
  }

  private safeNumber(value: bigint) {
    const number = Number(value);
    if (!Number.isSafeInteger(number)) throw new BadRequestException({ code: "MONEY_OUT_OF_RANGE", messageZh: "结算金额超出系统允许范围" });
    return number;
  }

  private async assertAgentReady(storeId: string) {
    const agent = await this.prisma.closingDeliveryAgent.findUnique({ where: { storeId } });
    const status = agent?.lastStatusJson as { messagesAvailable?: boolean } | null;
    if (!agent || agent.revokedAt || !agent.lastSeenAt || Date.now() - agent.lastSeenAt.getTime() > 120_000) throw new ConflictException({ code: "SETTLEMENT_DELIVERY_AGENT_OFFLINE", messageZh: "Mac 信息发送代理离线，请启动代理后重试" });
    if (!status?.messagesAvailable) throw new ConflictException({ code: "SETTLEMENT_MESSAGES_UNAVAILABLE", messageZh: "Mac 信息 App 当前没有可用的短信、RCS 或 iMessage 服务" });
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
    const job = await this.prisma.employeeSettlementDelivery.findFirst({ where: { id: deliveryId, storeId, status: "CLAIMED", leaseToken } });
    if (!job) throw new ForbiddenException({ code: "DELIVERY_LEASE_INVALID", messageZh: "发送任务租约无效或已经过期" });
    return job;
  }
}
