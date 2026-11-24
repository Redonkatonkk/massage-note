import { randomUUID } from "node:crypto";
import { ForbiddenException, Injectable } from "@nestjs/common";
import type { ClosingDeliveryFailureInput, ClosingDeliveryReceiptInput, MessagesReceipt } from "@massage-note/contracts";
import type { Prisma } from "@massage-note/database";
import { dispatchDate, dispatchSmsClock } from "../common/dispatch-sms-time.js";
import { PrismaService } from "../database/prisma.service.js";
import { authenticateDeliveryAgent } from "../finance/delivery-agent.js";
import { claimedDeliveryWhere, deliveryFailureState, dispatchCheckpointWhere, requireDeliveryLease } from "../finance/delivery-lease.js";
import { deliveryReceiptData, receiptCandidateOrder, receiptCandidateSelect, receiptCandidatesWhere } from "../finance/delivery-receipt.js";
import { StoreAccessService } from "../stores/store-access.service.js";

@Injectable()
export class DispatchSmsDeliveriesService {
  constructor(private readonly prisma: PrismaService, private readonly access: StoreAccessService) {}

  async status(userId: string, storeId: string) {
    await this.access.requireCapability(userId, storeId, "STORE_SETTINGS_MANAGE");
    const latest = await this.prisma.dispatchSmsDelivery.findFirst({
      where: { storeId },
      orderBy: { createdAt: "desc" },
      select: { targetDate: true, status: true, sentAt: true, deliveryStatus: true, lastErrorCode: true },
    });
    return latest && { ...latest, targetDate: latest.targetDate.toISOString().slice(0, 10) };
  }

  async claim(authorization: string | undefined) {
    const agent = await authenticateDeliveryAgent(this.prisma, authorization);
    const now = new Date();
    const store = await this.prisma.store.findUniqueOrThrow({
      where: { id: agent.storeId },
      select: { timezone: true, automaticDispatchEnabled: true, dispatchSmsSettings: { select: { enabled: true } } },
    });
    const eligible: Prisma.DispatchSmsDeliveryWhereInput[] = [{ dispatchStartedAt: { not: null } }];
    if (store.automaticDispatchEnabled && store.dispatchSmsSettings?.enabled) {
      eligible.push({ targetDate: dispatchDate(dispatchSmsClock(now, store.timezone).targetDate) });
    }
    const where: Prisma.DispatchSmsDeliveryWhereInput = {
      storeId: agent.storeId, nextAttemptAt: { lte: now },
      AND: [{ OR: eligible }, { OR: [{ status: "QUEUED" }, { status: "CLAIMED", leaseExpiresAt: { lte: now } }] }],
    };
    const candidate = await this.prisma.dispatchSmsDelivery.findFirst({
      where, orderBy: { targetDate: "asc" },
      select: { id: true, recipientPhoneE164: true, dispatchStartedAt: true },
    });
    if (!candidate) return null;
    const leaseToken = randomUUID();
    const changed = await this.prisma.dispatchSmsDelivery.updateMany({
      where: { ...where, id: candidate.id, dispatchStartedAt: candidate.dispatchStartedAt },
      data: {
        status: "CLAIMED", leaseToken, leaseExpiresAt: new Date(now.getTime() + 300_000),
        ...(candidate.dispatchStartedAt ? {} : { attemptCount: { increment: 1 } }),
      },
    });
    return changed.count === 1
      ? { id: candidate.id, leaseToken, phoneE164: candidate.recipientPhoneE164, dispatchStarted: !!candidate.dispatchStartedAt }
      : null;
  }

  async prepare(authorization: string | undefined, id: string, leaseToken: string) {
    const agent = await authenticateDeliveryAgent(this.prisma, authorization);
    const job = await this.prisma.dispatchSmsDelivery.findFirst({ where: claimedDeliveryWhere(agent.storeId, id, leaseToken) });
    return job?.body && !job.dispatchStartedAt ? { authorized: true, text: job.body } : { authorized: false };
  }

  async authorize(authorization: string | undefined, id: string, leaseToken: string) {
    const agent = await authenticateDeliveryAgent(this.prisma, authorization);
    return this.prisma.$transaction(async tx => {
      // This lock serializes the final send checkpoint with settings changes.
      await tx.$queryRaw`SELECT id FROM stores WHERE id = ${agent.storeId}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM closing_delivery_agents WHERE id = ${agent.id}::uuid FOR UPDATE`;
      await authenticateDeliveryAgent(tx, authorization);
      const where = dispatchCheckpointWhere(agent.storeId, id, leaseToken);
      const job = await tx.dispatchSmsDelivery.findFirst({
        where, include: { store: { include: { dispatchSmsSettings: true } } },
      });
      if (!job?.body) return { authorized: false };
      const now = new Date();
      const clock = dispatchSmsClock(now, job.store.timezone);
      const config = job.store.dispatchSmsSettings;
      if (!job.store.automaticDispatchEnabled || !config?.enabled || config.phoneE164 !== job.recipientPhoneE164 ||
          job.targetDate.getTime() !== dispatchDate(clock.targetDate).getTime()) {
        await tx.dispatchSmsDelivery.updateMany({
          where,
          data: { status: "CANCELLED", leaseToken: null, leaseExpiresAt: null, lastErrorCode: "EXPIRED" },
        });
        return { authorized: false };
      }
      requireDeliveryLease(await tx.dispatchSmsDelivery.updateMany({ where: { ...where, leaseExpiresAt: { gt: now } }, data: { dispatchStartedAt: now } }));
      return { authorized: true, dispatchRecorded: true };
    });
  }

  async complete(authorization: string | undefined, id: string, leaseToken: string, receipt: MessagesReceipt | undefined) {
    const agent = await authenticateDeliveryAgent(this.prisma, authorization);
    if (!receipt) throw new ForbiddenException({ code: "DELIVERY_RECEIPT_REQUIRED", messageZh: "缺少排工短信回执" });
    requireDeliveryLease(await this.prisma.dispatchSmsDelivery.updateMany({
      where: { ...claimedDeliveryWhere(agent.storeId, id, leaseToken), dispatchStartedAt: { not: null } },
      data: {
        ...deliveryReceiptData(receipt), status: "SENT", sentAt: new Date(),
        leaseToken: null, leaseExpiresAt: null, lastError: null, lastErrorCode: null,
      },
    }));
    return { sent: true };
  }

  async fail(authorization: string | undefined, id: string, input: ClosingDeliveryFailureInput) {
    const agent = await authenticateDeliveryAgent(this.prisma, authorization);
    const where = claimedDeliveryWhere(agent.storeId, id, input.leaseToken);
    const job = await this.prisma.dispatchSmsDelivery.findFirst({ where });
    if (!job) return { retryScheduled: false };
    const { data, retryScheduled } = deliveryFailureState(job, input);
    requireDeliveryLease(await this.prisma.dispatchSmsDelivery.updateMany({
      where: { ...where, dispatchStartedAt: job.dispatchStartedAt }, data,
    }));
    return { retryScheduled };
  }

  async receiptCandidates(authorization: string | undefined) {
    const agent = await authenticateDeliveryAgent(this.prisma, authorization);
    return this.prisma.dispatchSmsDelivery.findMany({
      where: receiptCandidatesWhere(agent.storeId),
      select: { ...receiptCandidateSelect, deliveryMessageGuid: true },
      orderBy: receiptCandidateOrder, take: 20,
    });
  }

  async receipt(authorization: string | undefined, id: string, input: ClosingDeliveryReceiptInput) {
    const agent = await authenticateDeliveryAgent(this.prisma, authorization);
    const where = { ...receiptCandidatesWhere(agent.storeId), id, attemptCount: input.attemptCount };
    const previous = await this.prisma.dispatchSmsDelivery.findFirst({
      where, select: { status: true, sentAt: true, deliveryCheckedAt: true, deliveryMessageGuid: true },
    });
    if (!previous) return { recorded: false };
    const unavailable = ["MISSING", "PENDING"].includes(input.receipt.state);
    const recovered = previous.status === "FAILED" && ["SENT", "DELIVERED"].includes(input.receipt.state);
    const now = new Date();
    const updated = await this.prisma.dispatchSmsDelivery.updateMany({
      where: { ...where, status: previous.status, deliveryCheckedAt: previous.deliveryCheckedAt },
      data: unavailable && previous.deliveryMessageGuid
        ? { deliveryCheckedAt: now }
        : {
          ...deliveryReceiptData(input.receipt),
          ...(recovered ? { status: "SENT", sentAt: previous.sentAt ?? now, lastError: null, lastErrorCode: null } : {}),
        },
    });
    return { recorded: updated.count === 1 };
  }
}
