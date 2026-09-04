import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type User } from "@massage-note/database";
import type {
  DeleteStoreInput,
  TransferOwnerInput,
  UpdateStoreInput,
} from "@massage-note/contracts";
import { IdempotencyService } from "../common/idempotency.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "./store-access.service.js";

function storeSnapshot(store: {
  id: string;
  name: string;
  timezone: string;
  businessCutoffLocal: string;
  globalCommissionBps: number;
  mondayThursdayAutoDiscountEnabled: boolean;
  mondayThursdayAutoDiscountThresholdCents: bigint;
  mondayThursdayAutoDiscountAmountCents: bigint;
  giftCardAutoDiscountEnabled: boolean;
  giftCardAutoDiscountThresholdCents: bigint;
  giftCardAutoDiscountBps: number;
  closingDefaultLocale: string;
  automaticDispatchEnabled: boolean;
  ownerMembershipId: string | null;
  status: string;
  version: number;
}) {
  return {
    id: store.id,
    name: store.name,
    timezone: store.timezone,
    businessCutoffLocal: store.businessCutoffLocal,
    globalCommissionBps: store.globalCommissionBps,
    mondayThursdayAutoDiscountEnabled:
      store.mondayThursdayAutoDiscountEnabled,
    mondayThursdayAutoDiscountThresholdCents:
      store.mondayThursdayAutoDiscountThresholdCents.toString(),
    mondayThursdayAutoDiscountAmountCents:
      store.mondayThursdayAutoDiscountAmountCents.toString(),
    giftCardAutoDiscountEnabled: store.giftCardAutoDiscountEnabled,
    giftCardAutoDiscountThresholdCents:
      store.giftCardAutoDiscountThresholdCents.toString(),
    giftCardAutoDiscountBps: store.giftCardAutoDiscountBps,
    closingDefaultLocale: store.closingDefaultLocale,
    automaticDispatchEnabled: store.automaticDispatchEnabled,
    ownerMembershipId: store.ownerMembershipId,
    status: store.status,
    version: store.version,
  };
}

@Injectable()
export class StoreManagementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoreAccessService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async get(actor: User, storeId: string) {
    await this.access.requireActiveMembership(actor.id, storeId);
    const store = await this.prisma.store.findFirst({
      where: { id: storeId, status: "ACTIVE", deletedAt: null },
      include: {
        ownerMembership: {
          select: { id: true, displayName: true, userId: true },
        },
      },
    });
    if (!store) this.throwStoreNotFound();
    return store;
  }

  async update(
    actor: User,
    storeId: string,
    input: UpdateStoreInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const actorMembership = await this.access.requireCapability(
      actor.id,
      storeId,
      "STORE_SETTINGS_MANAGE",
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "/api/v1/stores/:storeId",
        payload: input,
        responseCode: 200,
      },
      async (transaction) => {
        await transaction.$queryRaw`
          SELECT id FROM stores WHERE id = ${storeId}::uuid FOR UPDATE
        `;
        const current = await transaction.store.findFirst({
          where: { id: storeId, status: "ACTIVE", deletedAt: null },
        });
        if (!current) this.throwStoreNotFound();
        if (input.automaticDispatchEnabled === true) {
          const unconfiguredProviders = await transaction.storeMembership.findMany({
            where: {
              storeId,
              status: "ACTIVE",
              deletedAt: null,
              isServiceProvider: true,
              employmentType: null,
            },
            orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
            select: { displayName: true },
          });
          if (unconfiguredProviders.length > 0) {
            throw new ConflictException({
              code: "DAILY_RANKING_EMPLOYMENT_TYPE_REQUIRED",
              messageZh: `请先设置全职或兼职：${unconfiguredProviders
                .map((membership) => membership.displayName)
                .join("、")}`,
            });
          }
        }
        const changed = await transaction.store.updateMany({
          where: {
            id: storeId,
            status: "ACTIVE",
            deletedAt: null,
            version: input.version,
          },
          data: {
            ...(input.name === undefined ? {} : { name: input.name }),
            ...(input.timezone === undefined
              ? {}
              : { timezone: input.timezone }),
            ...(input.businessCutoffLocal === undefined
              ? {}
              : { businessCutoffLocal: input.businessCutoffLocal }),
            ...(input.globalCommissionBps === undefined
              ? {}
              : { globalCommissionBps: input.globalCommissionBps }),
            ...(input.mondayThursdayAutoDiscountEnabled === undefined
              ? {}
              : {
                  mondayThursdayAutoDiscountEnabled:
                    input.mondayThursdayAutoDiscountEnabled,
                  mondayThursdayAutoDiscountThresholdCents:
                    input.mondayThursdayAutoDiscountThresholdCents!,
                  mondayThursdayAutoDiscountAmountCents:
                    input.mondayThursdayAutoDiscountAmountCents!,
                }),
            ...(input.giftCardAutoDiscountEnabled === undefined
              ? {}
              : {
                  giftCardAutoDiscountEnabled: input.giftCardAutoDiscountEnabled,
                  giftCardAutoDiscountThresholdCents:
                    input.giftCardAutoDiscountThresholdCents!,
                  giftCardAutoDiscountBps: input.giftCardAutoDiscountBps!,
                }),
            ...(input.closingDefaultLocale === undefined
              ? {}
              : { closingDefaultLocale: input.closingDefaultLocale }),
            ...(input.automaticDispatchEnabled === undefined
              ? {}
              : { automaticDispatchEnabled: input.automaticDispatchEnabled }),
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          await this.throwStoreConflict(transaction, storeId);
        }
        const updated = await transaction.store.findUniqueOrThrow({
          where: { id: storeId },
        });
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: actorMembership.id,
            source: "api",
            action: "store.settings_updated",
            entityType: "store",
            entityId: storeId,
            beforeJson: storeSnapshot(current),
            afterJson: storeSnapshot(updated),
            requestId,
          },
        });
        return updated;
      },
    );
  }

  async transferOwner(
    actor: User,
    storeId: string,
    input: TransferOwnerInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const currentOwner = await this.access.requireCapability(
      actor.id,
      storeId,
      "OWNER_TRANSFER",
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "/api/v1/stores/:storeId/owner-transfer",
        payload: input,
        responseCode: 200,
      },
      async (transaction) => {
        const locked = await transaction.$queryRaw<
          Array<{ owner_membership_id: string | null; version: number }>
        >`
          SELECT owner_membership_id, version
          FROM stores
          WHERE id = ${storeId}::uuid AND status = 'ACTIVE' AND deleted_at IS NULL
          FOR UPDATE
        `;
        const store = locked[0];
        if (!store) this.throwStoreNotFound();
        if (
          store.version !== input.version ||
          store.owner_membership_id !== currentOwner.id
        ) {
          await this.throwStoreConflict(transaction, storeId);
        }
        if (input.newOwnerMembershipId === currentOwner.id) {
          throw new ConflictException({
            code: "OWNER_ALREADY_ASSIGNED",
            messageZh: "该成员已经是店铺拥有者",
          });
        }

        const nextOwner = await transaction.storeMembership.findFirst({
          where: {
            id: input.newOwnerMembershipId,
            storeId,
            status: "ACTIVE",
            deletedAt: null,
          },
        });
        if (!nextOwner) {
          throw new NotFoundException({
            code: "NEW_OWNER_NOT_FOUND",
            messageZh: "新的拥有者必须是本店在职成员",
          });
        }

        const previousOwner = await transaction.storeMembership.update({
          where: { id: currentOwner.id },
          data: { role: "MANAGER", version: { increment: 1 } },
        });
        const promotedOwner = await transaction.storeMembership.update({
          where: { id: nextOwner.id },
          data: { role: "OWNER", version: { increment: 1 } },
        });
        const updatedStore = await transaction.store.update({
          where: { id: storeId },
          data: {
            ownerMembershipId: promotedOwner.id,
            version: { increment: 1 },
          },
        });
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: currentOwner.id,
            source: "api",
            action: "store.owner_transferred",
            entityType: "store",
            entityId: storeId,
            beforeJson: {
              ownerMembershipId: currentOwner.id,
              ownerRole: currentOwner.role,
              storeVersion: input.version,
            },
            afterJson: {
              ownerMembershipId: promotedOwner.id,
              previousOwnerRole: previousOwner.role,
              newOwnerRole: promotedOwner.role,
              storeVersion: updatedStore.version,
            },
            requestId,
          },
        });
        return {
          store: updatedStore,
          previousOwner,
          newOwner: promotedOwner,
        };
      },
    );
  }

  async delete(
    actor: User,
    storeId: string,
    input: DeleteStoreInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const owner = await this.access.requireCapability(
      actor.id,
      storeId,
      "STORE_DELETE",
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "/api/v1/stores/:storeId:delete",
        payload: input,
        responseCode: 200,
      },
      async (transaction) => {
        const current = await transaction.store.findFirst({
          where: { id: storeId, status: "ACTIVE", deletedAt: null },
        });
        if (!current) this.throwStoreNotFound();
        const changed = await transaction.store.updateMany({
          where: {
            id: storeId,
            status: "ACTIVE",
            deletedAt: null,
            version: input.version,
          },
          data: {
            status: "DELETED",
            deletedAt: new Date(),
            deletedBy: actor.id,
            deleteReason: input.reason,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          await this.throwStoreConflict(transaction, storeId);
        }
        const deleted = await transaction.store.findUniqueOrThrow({
          where: { id: storeId },
        });
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: owner.id,
            source: "api",
            action: "store.deleted",
            entityType: "store",
            entityId: storeId,
            beforeJson: storeSnapshot(current),
            afterJson: storeSnapshot(deleted),
            reason: input.reason,
            requestId,
          },
        });
        return deleted;
      },
    );
  }

  private async throwStoreConflict(
    transaction: Prisma.TransactionClient,
    storeId: string,
  ): Promise<never> {
    const latest = await transaction.store.findUnique({ where: { id: storeId } });
    if (!latest) this.throwStoreNotFound();
    throw new ConflictException({
      code: "STORE_VERSION_CONFLICT",
      messageZh: "店铺设置已被其他人修改，请刷新后重试",
      latestResource: latest,
    });
  }

  private throwStoreNotFound(): never {
    throw new NotFoundException({
      code: "STORE_NOT_FOUND",
      messageZh: "店铺不存在或已停用",
    });
  }
}
