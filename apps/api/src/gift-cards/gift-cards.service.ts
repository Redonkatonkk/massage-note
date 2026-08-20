import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type StoreMembership, type User } from "@massage-note/database";
import type {
  CreateGiftCardSaleInput,
  DeleteGiftCardSaleInput,
  RestoreGiftCardSaleInput,
  UpdateGiftCardSaleInput,
} from "@massage-note/contracts";
import {
  businessDateFor,
  canWriteWorkRecord,
  hasStoreCapability,
} from "@massage-note/domain";
import { lockBusinessDay } from "../common/business-day-lock.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";

const dateAtUtc = (date: string) => new Date(`${date}T00:00:00.000Z`);
const dateOnly = (date: Date) => date.toISOString().slice(0, 10);

const saleInclude = {
  operator: {
    select: { id: true, displayName: true, role: true, status: true },
  },
};

@Injectable()
export class GiftCardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoreAccessService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async listDeleted(actor: User, storeId: string) {
    const membership = await this.access.requireActiveMembership(actor.id, storeId);
    this.assertCanRestore(membership);
    return this.prisma.giftCardSale.findMany({
      where: { storeId, deletedAt: { not: null } },
      include: saleInclude,
      orderBy: [{ deletedAt: "desc" }, { createdAt: "desc" }],
      take: 100,
    });
  }

  async create(
    actor: User,
    storeId: string,
    input: CreateGiftCardSaleInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const actorMembership = await this.access.requireActiveMembership(actor.id, storeId);
    try {
      return await this.idempotency.execute(
        {
          storeId,
          userId: actor.id,
          key: idempotencyKey,
          route: "/api/v1/stores/:storeId/gift-card-sales",
          payload: input,
          responseCode: 201,
        },
        async (transaction) => {
          await this.assertCanWrite(transaction, actorMembership, storeId, input.businessDate);
          await this.requireOperator(transaction, storeId, input.operatorMembershipId);
          const serialNumber = input.serialNumber.trim();
          const serialNumberNormalized = this.normalizeSerial(serialNumber);
          const amountCents = BigInt(input.cashCents) + BigInt(input.cardCents);
          if (amountCents <= 0n) {
            throw new BadRequestException({
              code: "GIFT_CARD_SALE_AMOUNT_REQUIRED",
              messageZh: "礼物卡付款总额必须大于 0",
            });
          }
          const sale = await transaction.giftCardSale.create({
            data: {
              storeId,
              businessDate: dateAtUtc(input.businessDate),
              serialNumber,
              serialNumberNormalized,
              cashCents: BigInt(input.cashCents),
              cardCents: BigInt(input.cardCents),
              amountCents,
              operatorMembershipId: input.operatorMembershipId,
              createdBy: actor.id,
              updatedBy: actor.id,
            },
            include: saleInclude,
          });
          await transaction.auditLog.create({
            data: {
              storeId,
              actorUserId: actor.id,
              actorMembershipId: actorMembership.id,
              source: "api",
              action: "gift_card.sale_created",
              entityType: "gift_card_sale",
              entityId: sale.id,
              businessDate: sale.businessDate,
              afterJson: this.auditSnapshot(sale),
              requestId,
            },
          });
          return sale;
        },
      );
    } catch (error) {
      this.rethrowDuplicateSerial(error);
    }
  }

  async update(
    actor: User,
    storeId: string,
    saleId: string,
    input: UpdateGiftCardSaleInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const actorMembership = await this.access.requireActiveMembership(actor.id, storeId);
    try {
      return await this.idempotency.execute(
        {
          storeId,
          userId: actor.id,
          key: idempotencyKey,
          route: "/api/v1/stores/:storeId/gift-card-sales/:saleId",
          payload: { saleId, input },
          responseCode: 200,
        },
        async (transaction) => {
          const current = await transaction.giftCardSale.findFirst({
            where: { id: saleId, storeId, deletedAt: null },
            include: saleInclude,
          });
          if (!current) this.throwNotFound();
          const businessDate = dateOnly(current.businessDate);
          await this.assertCanWrite(transaction, actorMembership, storeId, businessDate);
          const operatorMembershipId =
            input.operatorMembershipId ?? current.operatorMembershipId;
          await this.requireOperator(transaction, storeId, operatorMembershipId);
          const serialNumber = input.serialNumber?.trim() ?? current.serialNumber;
          const cashCents = BigInt(input.cashCents ?? current.cashCents);
          const cardCents = BigInt(input.cardCents ?? current.cardCents);
          const amountCents = cashCents + cardCents;
          if (amountCents <= 0n) {
            throw new BadRequestException({
              code: "GIFT_CARD_SALE_AMOUNT_REQUIRED",
              messageZh: "礼物卡付款总额必须大于 0",
            });
          }
          const changed = await transaction.giftCardSale.updateMany({
            where: { id: saleId, storeId, deletedAt: null, version: input.version },
            data: {
              serialNumber,
              serialNumberNormalized: this.normalizeSerial(serialNumber),
              cashCents,
              cardCents,
              amountCents,
              operatorMembershipId,
              updatedBy: actor.id,
              version: { increment: 1 },
            },
          });
          if (changed.count !== 1) await this.throwConflict(transaction, storeId, saleId);
          const updated = await transaction.giftCardSale.findUniqueOrThrow({
            where: { id: saleId },
            include: saleInclude,
          });
          await transaction.auditLog.create({
            data: {
              storeId,
              actorUserId: actor.id,
              actorMembershipId: actorMembership.id,
              source: "api",
              action: "gift_card.sale_updated",
              entityType: "gift_card_sale",
              entityId: saleId,
              businessDate: current.businessDate,
              beforeJson: this.auditSnapshot(current),
              afterJson: this.auditSnapshot(updated),
              requestId,
            },
          });
          return updated;
        },
      );
    } catch (error) {
      this.rethrowDuplicateSerial(error);
    }
  }

  async remove(
    actor: User,
    storeId: string,
    saleId: string,
    input: DeleteGiftCardSaleInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const actorMembership = await this.access.requireActiveMembership(actor.id, storeId);
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "/api/v1/stores/:storeId/gift-card-sales/:saleId/delete",
        payload: { saleId, input },
        responseCode: 200,
      },
      async (transaction) => {
        const current = await transaction.giftCardSale.findFirst({
          where: { id: saleId, storeId, deletedAt: null },
          include: saleInclude,
        });
        if (!current) this.throwNotFound();
        await this.assertCanWrite(
          transaction,
          actorMembership,
          storeId,
          dateOnly(current.businessDate),
        );
        const deletedAt = new Date();
        const changed = await transaction.giftCardSale.updateMany({
          where: { id: saleId, storeId, deletedAt: null, version: input.version },
          data: {
            deletedAt,
            deletedBy: actor.id,
            deleteReason: input.reason ?? null,
            updatedBy: actor.id,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) await this.throwConflict(transaction, storeId, saleId);
        const deleted = await transaction.giftCardSale.findUniqueOrThrow({
          where: { id: saleId },
          include: saleInclude,
        });
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: actorMembership.id,
            source: "api",
            action: "gift_card.sale_deleted",
            entityType: "gift_card_sale",
            entityId: saleId,
            businessDate: current.businessDate,
            beforeJson: this.auditSnapshot(current),
            afterJson: {
              ...this.auditSnapshot(deleted),
              deletedAt: deletedAt.toISOString(),
              deleteReason: input.reason ?? null,
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
    saleId: string,
    input: RestoreGiftCardSaleInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const actorMembership = await this.access.requireActiveMembership(actor.id, storeId);
    this.assertCanRestore(actorMembership);
    try {
      return await this.idempotency.execute(
        {
          storeId,
          userId: actor.id,
          key: idempotencyKey,
          route: "/api/v1/stores/:storeId/gift-card-sales/:saleId/restore",
          payload: { saleId, input },
          responseCode: 200,
        },
        async (transaction) => {
          const current = await transaction.giftCardSale.findFirst({
            where: { id: saleId, storeId, deletedAt: { not: null } },
            include: saleInclude,
          });
          if (!current) this.throwNotFound();
          await this.assertCanWrite(
            transaction,
            actorMembership,
            storeId,
            dateOnly(current.businessDate),
          );
          const changed = await transaction.giftCardSale.updateMany({
            where: {
              id: saleId,
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
          if (changed.count !== 1) await this.throwConflict(transaction, storeId, saleId);
          const restored = await transaction.giftCardSale.findUniqueOrThrow({
            where: { id: saleId },
            include: saleInclude,
          });
          await transaction.auditLog.create({
            data: {
              storeId,
              actorUserId: actor.id,
              actorMembershipId: actorMembership.id,
              source: "api",
              action: "gift_card.sale_restored",
              entityType: "gift_card_sale",
              entityId: saleId,
              businessDate: current.businessDate,
              beforeJson: {
                ...this.auditSnapshot(current),
                deletedAt: current.deletedAt?.toISOString() ?? null,
                deleteReason: current.deleteReason,
              },
              afterJson: {
                ...this.auditSnapshot(restored),
                deletedAt: null,
                deleteReason: null,
              },
              requestId,
            },
          });
          return restored;
        },
      );
    } catch (error) {
      this.rethrowDuplicateSerial(error);
    }
  }

  private async assertCanWrite(
    transaction: Prisma.TransactionClient,
    actorMembership: StoreMembership,
    storeId: string,
    businessDate: string,
  ) {
    await lockBusinessDay(transaction, storeId, businessDate);
    const [store, closing] = await Promise.all([
      transaction.store.findFirst({
        where: { id: storeId, status: "ACTIVE", deletedAt: null },
        select: { timezone: true, businessCutoffLocal: true },
      }),
      transaction.businessDayClosing.findFirst({
        where: { storeId, businessDate: dateAtUtc(businessDate), status: "CLOSED" },
        select: { id: true },
      }),
    ]);
    if (!store) {
      throw new NotFoundException({ code: "STORE_NOT_FOUND", messageZh: "店铺不存在或已停用" });
    }
    const currentBusinessDate = businessDateFor({
      startAt: new Date(),
      timezone: store.timezone,
      cutoffLocal: store.businessCutoffLocal,
    });
    if (!canWriteWorkRecord({
      role: actorMembership.role,
      isCurrentBusinessDay: businessDate === currentBusinessDate,
      isDayClosed: Boolean(closing),
    })) {
      throw new ConflictException({
        code: closing ? "BUSINESS_DAY_CLOSED" : "GIFT_CARD_SALE_WRITE_FORBIDDEN",
        messageZh: closing
          ? "该营业日已经日结，请先取消日结再修改礼物卡记录"
          : "普通员工只能修改当前营业日的礼物卡记录",
      });
    }
  }

  private assertCanRestore(membership: StoreMembership) {
    if (!hasStoreCapability(membership.role, "WORK_RECORD_WRITE_HISTORY")) {
      throw new ForbiddenException({
        code: "GIFT_CARD_SALE_RESTORE_FORBIDDEN",
        messageZh: "只有店长或经理可以查看和恢复已删除礼物卡销售记录",
      });
    }
  }

  private async requireOperator(
    transaction: Prisma.TransactionClient,
    storeId: string,
    membershipId: string,
  ) {
    const operator = await transaction.storeMembership.findFirst({
      where: { id: membershipId, storeId, status: "ACTIVE", deletedAt: null },
      select: { id: true },
    });
    if (!operator) {
      throw new BadRequestException({
        code: "GIFT_CARD_OPERATOR_INVALID",
        messageZh: "请选择该店的在职员工作为操作人",
      });
    }
  }

  private normalizeSerial(value: string): string {
    return value.normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase();
  }

  private auditSnapshot(sale: {
    serialNumber: string;
    cashCents: bigint;
    cardCents: bigint;
    amountCents: bigint;
    operatorMembershipId: string;
    version: number;
  }) {
    return {
      serialNumber: sale.serialNumber,
      cashCents: sale.cashCents.toString(),
      cardCents: sale.cardCents.toString(),
      amountCents: sale.amountCents.toString(),
      operatorMembershipId: sale.operatorMembershipId,
      version: sale.version,
    };
  }

  private rethrowDuplicateSerial(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictException({
        code: "GIFT_CARD_SERIAL_DUPLICATE",
        messageZh: "这张礼物卡序列号已经登记过，请核对后再试",
      });
    }
    throw error;
  }

  private async throwConflict(
    transaction: Prisma.TransactionClient,
    storeId: string,
    saleId: string,
  ): Promise<never> {
    const latest = await transaction.giftCardSale.findFirst({
      where: { id: saleId, storeId },
      include: saleInclude,
    });
    if (!latest) this.throwNotFound();
    throw new ConflictException({
      code: "GIFT_CARD_SALE_VERSION_CONFLICT",
      messageZh: "礼物卡记录已被其他设备修改，请刷新后重试",
      latestResource: latest,
    });
  }

  private throwNotFound(): never {
    throw new NotFoundException({
      code: "GIFT_CARD_SALE_NOT_FOUND",
      messageZh: "没有找到这条礼物卡销售记录",
    });
  }
}
