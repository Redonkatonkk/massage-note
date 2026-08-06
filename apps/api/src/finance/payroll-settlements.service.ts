import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type User } from "@massage-note/database";
import type {
  CreatePayrollSettlementInput,
  DeletePayrollSettlementInput,
  PayrollListQuery,
  RestorePayrollSettlementInput,
  UpdatePayrollSettlementInput,
} from "@massage-note/contracts";
import {
  calculatePayrollPaymentTotal,
  hasStoreCapability,
} from "@massage-note/domain";
import { IdempotencyService } from "../common/idempotency.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";

const dateAtUtc = (date: string) => new Date(`${date}T00:00:00.000Z`);
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

const payrollInclude = {
  membership: {
    select: { id: true, displayName: true, role: true, status: true },
  },
};

@Injectable()
export class PayrollSettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoreAccessService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(actor: User, storeId: string, query: PayrollListQuery) {
    const actorMembership = await this.access.requireActiveMembership(
      actor.id,
      storeId,
    );
    const mayManage = hasStoreCapability(actorMembership.role, "PAYROLL_MANAGE");
    if (
      query.membershipId &&
      query.membershipId !== actorMembership.id &&
      !mayManage
    ) {
      this.throwPayrollReadForbidden();
    }
    const [settlements, actors] = await Promise.all([
      this.prisma.payrollSettlement.findMany({
        where: {
          storeId,
          ...(mayManage
            ? query.membershipId
              ? { membershipId: query.membershipId }
              : {}
            : { membershipId: actorMembership.id }),
          ...(mayManage && query.includeDeleted
            ? {}
            : { deletedAt: null }),
        },
        include: payrollInclude,
        orderBy: [{ settlementDate: "desc" }, { createdAt: "desc" }],
        take: 1_000,
      }),
      this.prisma.storeMembership.findMany({ where: { storeId }, select: { userId: true, displayName: true }, orderBy: { joinedAt: "desc" } }),
    ]);
    const names = new Map<string, string>();
    for (const item of actors) if (!names.has(item.userId)) names.set(item.userId, item.displayName);
    const coveredRecords = settlements.length === 0 ? [] : await this.prisma.workRecord.findMany({
      where: {
        storeId,
        employeeMembershipId: { in: [...new Set(settlements.map((item) => item.membershipId))] },
        businessDate: {
          gte: new Date(Math.min(...settlements.map((item) => item.periodStart.getTime()))),
          lte: new Date(Math.max(...settlements.map((item) => item.periodEnd.getTime()))),
        },
      },
      select: { employeeMembershipId: true, businessDate: true, updatedAt: true },
    });
    return settlements.map((item) => ({
      ...item,
      createdByDisplayName: names.get(item.createdBy) ?? "原店铺成员",
      updatedByDisplayName: names.get(item.updatedBy) ?? "原店铺成员",
      historyChangedAfterSettlement: coveredRecords.some((record) => record.employeeMembershipId === item.membershipId && record.businessDate >= item.periodStart && record.businessDate <= item.periodEnd && record.updatedAt > item.updatedAt),
    }));
  }

  async get(actor: User, storeId: string, settlementId: string) {
    const actorMembership = await this.access.requireActiveMembership(
      actor.id,
      storeId,
    );
    const settlement = await this.prisma.payrollSettlement.findFirst({
      where: { id: settlementId, storeId },
      include: payrollInclude,
    });
    if (!settlement) this.throwPayrollNotFound();
    if (
      settlement.membershipId !== actorMembership.id &&
      !hasStoreCapability(actorMembership.role, "PAYROLL_MANAGE")
    ) {
      this.throwPayrollReadForbidden();
    }
    const actors = await this.prisma.storeMembership.findMany({ where: { storeId, userId: { in: [settlement.createdBy, settlement.updatedBy] } }, select: { userId: true, displayName: true }, orderBy: { joinedAt: "desc" } });
    const names = new Map(actors.map((item) => [item.userId, item.displayName]));
    return { ...settlement, createdByDisplayName: names.get(settlement.createdBy) ?? "原店铺成员", updatedByDisplayName: names.get(settlement.updatedBy) ?? "原店铺成员" };
  }

  async create(
    actor: User,
    storeId: string,
    input: CreatePayrollSettlementInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const manager = await this.access.requireCapability(
      actor.id,
      storeId,
      "PAYROLL_MANAGE",
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "/api/v1/stores/:storeId/payroll-settlements",
        payload: input,
        responseCode: 201,
      },
      async (transaction) => {
        await this.assertPayableMembership(
          transaction,
          storeId,
          input.membershipId,
        );
        const totalPaidCents = calculatePayrollPaymentTotal({
          serviceWageCents: BigInt(input.serviceWageCents),
          cashTipCents: BigInt(input.cashTipCents),
          cardTipCents: BigInt(input.cardTipCents),
          adjustmentCents: BigInt(input.adjustmentCents),
        });
        this.assertSafeTotal(totalPaidCents);
        if (totalPaidCents < 0n && !input.negativeTotalReason) {
          this.throwNegativeConfirmationRequired();
        }
        const settlement = await transaction.payrollSettlement.create({
          data: {
            storeId,
            membershipId: input.membershipId,
            settlementDate: dateAtUtc(input.settlementDate),
            periodStart: dateAtUtc(input.periodStart),
            periodEnd: dateAtUtc(input.periodEnd),
            serviceWageCents: BigInt(input.serviceWageCents),
            cashTipCents: BigInt(input.cashTipCents),
            cardTipCents: BigInt(input.cardTipCents),
            adjustmentCents: BigInt(input.adjustmentCents),
            totalPaidCents,
            paymentMethod: input.paymentMethod,
            note: input.note,
            createdBy: actor.id,
            updatedBy: actor.id,
          },
          include: payrollInclude,
        });
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: manager.id,
            source: "api",
            action: "payroll_settlement.created",
            entityType: "payroll_settlement",
            entityId: settlement.id,
            afterJson: this.auditSnapshot(settlement),
            reason: input.negativeTotalReason ?? null,
            requestId,
          },
        });
        return settlement;
      },
    );
  }

  async update(
    actor: User,
    storeId: string,
    settlementId: string,
    input: UpdatePayrollSettlementInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const manager = await this.access.requireCapability(
      actor.id,
      storeId,
      "PAYROLL_MANAGE",
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "/api/v1/stores/:storeId/payroll-settlements/:id",
        payload: { settlementId, input },
        responseCode: 200,
      },
      async (transaction) => {
        const current = await transaction.payrollSettlement.findFirst({
          where: { id: settlementId, storeId, deletedAt: null },
        });
        if (!current) this.throwPayrollNotFound();
        await this.assertPayableMembership(
          transaction,
          storeId,
          current.membershipId,
        );
        const periodStart = input.periodStart ?? dateOnly(current.periodStart);
        const periodEnd = input.periodEnd ?? dateOnly(current.periodEnd);
        if (periodEnd < periodStart) {
          throw new BadRequestException({
            code: "INVALID_PAYROLL_PERIOD",
            messageZh: "覆盖结束日期不能早于开始日期",
          });
        }
        const serviceWageCents = BigInt(
          input.serviceWageCents ?? current.serviceWageCents,
        );
        const cashTipCents = BigInt(input.cashTipCents ?? current.cashTipCents);
        const cardTipCents = BigInt(input.cardTipCents ?? current.cardTipCents);
        const adjustmentCents = BigInt(
          input.adjustmentCents ?? current.adjustmentCents,
        );
        const totalPaidCents = calculatePayrollPaymentTotal({
          serviceWageCents,
          cashTipCents,
          cardTipCents,
          adjustmentCents,
        });
        this.assertSafeTotal(totalPaidCents);
        if (totalPaidCents < 0n && !input.negativeTotalReason) {
          this.throwNegativeConfirmationRequired();
        }
        const changed = await transaction.payrollSettlement.updateMany({
          where: {
            id: settlementId,
            storeId,
            deletedAt: null,
            version: input.version,
          },
          data: {
            ...(input.settlementDate
              ? { settlementDate: dateAtUtc(input.settlementDate) }
              : {}),
            periodStart: dateAtUtc(periodStart),
            periodEnd: dateAtUtc(periodEnd),
            serviceWageCents,
            cashTipCents,
            cardTipCents,
            adjustmentCents,
            totalPaidCents,
            ...(input.paymentMethod
              ? { paymentMethod: input.paymentMethod }
              : {}),
            ...(input.note === undefined ? {} : { note: input.note }),
            updatedBy: actor.id,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          await this.throwPayrollConflict(transaction, settlementId, storeId);
        }
        const updated = await transaction.payrollSettlement.findUniqueOrThrow({
          where: { id: settlementId },
          include: payrollInclude,
        });
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: manager.id,
            source: "api",
            action: "payroll_settlement.updated",
            entityType: "payroll_settlement",
            entityId: settlementId,
            beforeJson: this.auditSnapshot(current),
            afterJson: this.auditSnapshot(updated),
            reason: input.negativeTotalReason ?? null,
            requestId,
          },
        });
        return updated;
      },
    );
  }

  async remove(
    actor: User,
    storeId: string,
    settlementId: string,
    input: DeletePayrollSettlementInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const manager = await this.access.requireCapability(
      actor.id,
      storeId,
      "PAYROLL_MANAGE",
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "DELETE /api/v1/stores/:storeId/payroll-settlements/:id",
        payload: { settlementId, input },
        responseCode: 200,
      },
      async (transaction) => {
        const current = await transaction.payrollSettlement.findFirst({
          where: { id: settlementId, storeId, deletedAt: null },
        });
        if (!current) this.throwPayrollNotFound();
        const deletedAt = new Date();
        const changed = await transaction.payrollSettlement.updateMany({
          where: {
            id: settlementId,
            storeId,
            deletedAt: null,
            version: input.version,
          },
          data: {
            deletedAt,
            deletedBy: actor.id,
            deleteReason: input.reason ?? null,
            updatedBy: actor.id,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          await this.throwPayrollConflict(transaction, settlementId, storeId);
        }
        const deleted = await transaction.payrollSettlement.findUniqueOrThrow({
          where: { id: settlementId },
          include: payrollInclude,
        });
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: manager.id,
            source: "api",
            action: "payroll_settlement.deleted",
            entityType: "payroll_settlement",
            entityId: settlementId,
            beforeJson: this.auditSnapshot(current),
            afterJson: {
              deletedAt: deletedAt.toISOString(),
              deletedBy: actor.id,
              deleteReason: input.reason ?? null,
              version: deleted.version,
            },
            reason: input.reason ?? null,
            requestId,
          },
        });
        return deleted;
      },
    );
  }

  async restore(
    actor: User,
    storeId: string,
    settlementId: string,
    input: RestorePayrollSettlementInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const manager = await this.access.requireCapability(
      actor.id,
      storeId,
      "PAYROLL_MANAGE",
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "/api/v1/stores/:storeId/payroll-settlements/:id/restore",
        payload: { settlementId, input },
        responseCode: 200,
      },
      async (transaction) => {
        const current = await transaction.payrollSettlement.findFirst({
          where: { id: settlementId, storeId, deletedAt: { not: null } },
        });
        if (!current) this.throwPayrollNotFound();
        await this.assertPayableMembership(
          transaction,
          storeId,
          current.membershipId,
        );
        const changed = await transaction.payrollSettlement.updateMany({
          where: {
            id: settlementId,
            storeId,
            deletedAt: { not: null },
            version: input.version,
          },
          data: {
            deletedAt: null,
            deletedBy: null,
            deleteReason: null,
            updatedBy: actor.id,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          await this.throwPayrollConflict(transaction, settlementId, storeId);
        }
        const restored = await transaction.payrollSettlement.findUniqueOrThrow({
          where: { id: settlementId },
          include: payrollInclude,
        });
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: manager.id,
            source: "api",
            action: "payroll_settlement.restored",
            entityType: "payroll_settlement",
            entityId: settlementId,
            beforeJson: {
              deletedAt: current.deletedAt?.toISOString() ?? null,
              deletedBy: current.deletedBy,
              version: current.version,
            },
            afterJson: { deletedAt: null, version: restored.version },
            requestId,
          },
        });
        return restored;
      },
    );
  }

  private async assertPayableMembership(
    transaction: Prisma.TransactionClient,
    storeId: string,
    membershipId: string,
  ) {
    const [store, membership] = await Promise.all([
      transaction.store.findFirst({
        where: { id: storeId, status: "ACTIVE", deletedAt: null },
        select: { ownerMembershipId: true },
      }),
      transaction.storeMembership.findFirst({
        where: { id: membershipId, storeId },
        select: { id: true },
      }),
    ]);
    if (!store || !membership) {
      throw new NotFoundException({
        code: "PAYROLL_MEMBER_NOT_FOUND",
        messageZh: "没有找到该店的工资结算对象",
      });
    }
    if (store.ownerMembershipId === membershipId) {
      throw new ForbiddenException({
        code: "OWNER_PAYROLL_FORBIDDEN",
        messageZh: "店主本人的服务收入不进入老板尚欠和工资结算",
      });
    }
  }

  private auditSnapshot(settlement: {
    membershipId: string;
    settlementDate: Date;
    periodStart: Date;
    periodEnd: Date;
    serviceWageCents: bigint;
    cashTipCents: bigint;
    cardTipCents: bigint;
    adjustmentCents: bigint;
    totalPaidCents: bigint;
    paymentMethod: string;
    note: string;
    version: number;
  }) {
    return {
      membershipId: settlement.membershipId,
      settlementDate: dateOnly(settlement.settlementDate),
      periodStart: dateOnly(settlement.periodStart),
      periodEnd: dateOnly(settlement.periodEnd),
      serviceWageCents: settlement.serviceWageCents.toString(),
      cashTipCents: settlement.cashTipCents.toString(),
      cardTipCents: settlement.cardTipCents.toString(),
      adjustmentCents: settlement.adjustmentCents.toString(),
      totalPaidCents: settlement.totalPaidCents.toString(),
      paymentMethod: settlement.paymentMethod,
      note: settlement.note,
      version: settlement.version,
    };
  }

  private assertSafeTotal(value: bigint) {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new BadRequestException({
        code: "AMOUNT_TOTAL_TOO_LARGE",
        messageZh: "本次支付总额超出系统允许范围",
      });
    }
  }

  private throwNegativeConfirmationRequired(): never {
    throw new BadRequestException({
      code: "NEGATIVE_PAYROLL_CONFIRMATION_REQUIRED",
      messageZh: "负数支付总额必须二次确认并填写原因",
    });
  }

  private async throwPayrollConflict(
    transaction: Prisma.TransactionClient,
    settlementId: string,
    storeId: string,
  ): Promise<never> {
    const latest = await transaction.payrollSettlement.findFirst({
      where: { id: settlementId, storeId },
      include: payrollInclude,
    });
    if (!latest) this.throwPayrollNotFound();
    throw new ConflictException({
      code: "PAYROLL_SETTLEMENT_VERSION_CONFLICT",
      messageZh: "工资结算记录已发生变化，请刷新后重试",
      latestResource: latest,
    });
  }

  private throwPayrollNotFound(): never {
    throw new NotFoundException({
      code: "PAYROLL_SETTLEMENT_NOT_FOUND",
      messageZh: "没有找到该工资结算记录",
    });
  }

  private throwPayrollReadForbidden(): never {
    throw new ForbiddenException({
      code: "PAYROLL_READ_FORBIDDEN",
      messageZh: "普通员工只能查看自己的工资结算",
    });
  }
}
