import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type User } from "@massage-note/database";
import type {
  CreateCatalogItemInput,
  CatalogListQuery,
  DeleteCatalogItemInput,
  InitializeCatalog,
  RestoreCatalogItemInput,
  UpdateCatalogItemInput,
} from "@massage-note/contracts";
import { toJsonSafe } from "../common/json-safe.interceptor.js";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "./store-access.service.js";
import { IdempotencyService } from "../common/idempotency.service.js";

type CatalogItemResult = {
  id: string;
  version: number;
  deletedAt: Date | null;
  [key: string]: unknown;
};

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoreAccessService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(
    actor: User,
    storeId: string,
    query: CatalogListQuery = { includeDeleted: false },
  ) {
    await this.access.requireActiveMembership(actor.id, storeId);
    const [serviceItems, addonItems, discountItems] = await Promise.all([
      this.prisma.serviceItem.findMany({
        where: { storeId, ...(query.includeDeleted ? {} : { deletedAt: null }) },
        orderBy: [{ deletedAt: "asc" }, { position: "asc" }],
        include: { priceOptions: { orderBy: [{ position: "asc" }, { durationMinutes: "asc" }] } },
      }),
      this.prisma.addonItem.findMany({
        where: { storeId, ...(query.includeDeleted ? {} : { deletedAt: null }) },
        orderBy: [{ deletedAt: "asc" }, { position: "asc" }],
      }),
      this.prisma.discountItem.findMany({
        where: { storeId, ...(query.includeDeleted ? {} : { deletedAt: null }) },
        orderBy: [{ deletedAt: "asc" }, { position: "asc" }],
      }),
    ]);
    return { serviceItems, addonItems, discountItems };
  }

  async initialize(
    actor: User,
    storeId: string,
    input: InitializeCatalog,
    idempotencyKey: string,
    requestId: string,
  ) {
    const actorMembership = await this.access.requireCapability(
      actor.id,
      storeId,
      "CATALOG_MANAGE",
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "/api/v1/stores/:storeId/catalog/setup",
        payload: input,
        responseCode: 201,
      },
      async (transaction) => {
      const lockedStore = await transaction.$queryRaw<Array<{ id: string }>>`
        SELECT id
        FROM stores
        WHERE id = ${storeId}::uuid AND status = 'ACTIVE' AND deleted_at IS NULL
        FOR UPDATE
      `;
      if (lockedStore.length !== 1) {
        throw new ConflictException({
          code: "STORE_NOT_ACTIVE",
          messageZh: "店铺不存在或已经停用",
        });
      }
      const [serviceCount, addonCount, discountCount] = await Promise.all([
        transaction.serviceItem.count({ where: { storeId } }),
        transaction.addonItem.count({ where: { storeId } }),
        transaction.discountItem.count({ where: { storeId } }),
      ]);
      if (serviceCount + addonCount + discountCount > 0) {
        throw new ConflictException({
          code: "CATALOG_ALREADY_INITIALIZED",
          messageZh: "店铺项目已经初始化，请在项目管理中逐项修改",
        });
      }

      for (const [position, item] of input.serviceItems.entries()) {
        const firstOption = item.priceOptions[0]!;
        await transaction.serviceItem.create({
          data: {
            storeId,
            fullName: item.fullName,
            shortName: item.shortName,
            // 兼容滚动部署中的旧容器；新业务读取 priceOptions。
            durationMinutes: firstOption.durationMinutes,
            priceCents: BigInt(firstOption.priceCents),
            defaultCommissionBps: item.defaultCommissionBps ?? null,
            position,
            priceOptions: {
              create: item.priceOptions.map((option, optionPosition) => ({
                durationMinutes: option.durationMinutes,
                priceCents: BigInt(option.priceCents),
                position: optionPosition,
              })),
            },
          },
        });
      }
      if (input.addonItems.length > 0) {
        await transaction.addonItem.createMany({
          data: input.addonItems.map((item, position) => ({
            storeId,
            name: item.name,
            shortName: item.shortName,
            amountCents: BigInt(item.amountCents),
            durationMinutes: item.durationMinutes ?? null,
            defaultCommissionBps: item.defaultCommissionBps ?? null,
            position,
          })),
        });
      }
      if (input.discountItems.length > 0) {
        await transaction.discountItem.createMany({
          data: input.discountItems.map((item, position) => ({
            storeId,
            name: item.name,
            shortName: item.shortName,
            amountCents: BigInt(item.amountCents),
            position,
          })),
        });
      }
      await transaction.auditLog.create({
        data: {
          storeId,
          actorUserId: actor.id,
          actorMembershipId: actorMembership.id,
          source: "api",
          action: "catalog.initialized",
          entityType: "store",
          entityId: storeId,
          afterJson: {
            serviceItemCount: input.serviceItems.length,
            addonItemCount: input.addonItems.length,
            discountItemCount: input.discountItems.length,
          },
          requestId,
        },
      });

      const [serviceItems, addonItems, discountItems] = await Promise.all([
        transaction.serviceItem.findMany({
          where: { storeId, deletedAt: null },
          orderBy: { position: "asc" },
          include: { priceOptions: { orderBy: [{ position: "asc" }, { durationMinutes: "asc" }] } },
        }),
        transaction.addonItem.findMany({
          where: { storeId, deletedAt: null },
          orderBy: { position: "asc" },
        }),
        transaction.discountItem.findMany({
          where: { storeId, deletedAt: null },
          orderBy: { position: "asc" },
        }),
      ]);
        return { serviceItems, addonItems, discountItems };
      },
    );
  }

  async createItem(
    actor: User,
    storeId: string,
    input: CreateCatalogItemInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const manager = await this.access.requireCapability(
      actor.id,
      storeId,
      "CATALOG_MANAGE",
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "/api/v1/stores/:storeId/catalog/items",
        payload: input,
        responseCode: 201,
      },
      async (transaction) => {
        let item: CatalogItemResult;
        let entityType: string;
        if (input.type === "SERVICE") {
          const maximum = await transaction.serviceItem.aggregate({
            where: { storeId },
            _max: { position: true },
          });
          const firstOption = input.priceOptions[0]!;
          item = await transaction.serviceItem.create({
            data: {
              storeId,
              fullName: input.fullName,
              shortName: input.shortName,
              durationMinutes: firstOption.durationMinutes,
              priceCents: BigInt(firstOption.priceCents),
              defaultCommissionBps: input.defaultCommissionBps ?? null,
              position: input.position ?? (maximum._max.position ?? -1) + 1,
              priceOptions: {
                create: input.priceOptions.map((option, position) => ({
                  durationMinutes: option.durationMinutes,
                  priceCents: BigInt(option.priceCents),
                  position,
                })),
              },
            },
            include: { priceOptions: { orderBy: [{ position: "asc" }, { durationMinutes: "asc" }] } },
          });
          entityType = "service_item";
        } else if (input.type === "ADDON") {
          const maximum = await transaction.addonItem.aggregate({
            where: { storeId },
            _max: { position: true },
          });
          item = await transaction.addonItem.create({
            data: {
              storeId,
              name: input.name,
              shortName: input.shortName,
              amountCents: BigInt(input.amountCents),
              durationMinutes: input.durationMinutes ?? null,
              defaultCommissionBps: input.defaultCommissionBps ?? null,
              position: input.position ?? (maximum._max.position ?? -1) + 1,
            },
          });
          entityType = "addon_item";
        } else {
          const maximum = await transaction.discountItem.aggregate({
            where: { storeId },
            _max: { position: true },
          });
          item = await transaction.discountItem.create({
            data: {
              storeId,
              name: input.name,
              shortName: input.shortName,
              amountCents: BigInt(input.amountCents),
              position: input.position ?? (maximum._max.position ?? -1) + 1,
            },
          });
          entityType = "discount_item";
        }
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: manager.id,
            source: "api",
            action: "catalog.item_created",
            entityType,
            entityId: item.id,
            afterJson: toJsonSafe(item) as Prisma.InputJsonValue,
            requestId,
          },
        });
        return item;
      },
    );
  }

  async updateItem(
    actor: User,
    storeId: string,
    itemId: string,
    input: UpdateCatalogItemInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const manager = await this.access.requireCapability(
      actor.id,
      storeId,
      "CATALOG_MANAGE",
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "/api/v1/stores/:storeId/catalog/items/:itemId",
        payload: { itemId, input },
        responseCode: 200,
      },
      async (transaction) => {
        let current: CatalogItemResult;
        let updated: CatalogItemResult;
        let entityType: string;
        if (input.type === "SERVICE") {
          current = await this.findServiceItem(transaction, storeId, itemId);
          const firstOption = input.priceOptions?.[0];
          const changed = await transaction.serviceItem.updateMany({
            where: { id: itemId, storeId, deletedAt: null, version: input.version },
            data: {
              ...(input.fullName === undefined ? {} : { fullName: input.fullName }),
              ...(input.shortName === undefined ? {} : { shortName: input.shortName }),
              ...(firstOption === undefined
                ? {}
                : {
                    durationMinutes: firstOption.durationMinutes,
                    priceCents: BigInt(firstOption.priceCents),
                  }),
              ...(input.defaultCommissionBps === undefined
                ? {}
                : { defaultCommissionBps: input.defaultCommissionBps }),
              ...(input.position === undefined ? {} : { position: input.position }),
              ...(input.isEnabled === undefined
                ? {}
                : { isEnabled: input.isEnabled }),
              version: { increment: 1 },
            },
          });
          if (changed.count !== 1) {
            await this.throwItemConflict(transaction, storeId, itemId, input.type);
          }
          if (input.priceOptions) {
            await transaction.serviceItemPriceOption.deleteMany({
              where: { serviceItemId: itemId },
            });
            await transaction.serviceItemPriceOption.createMany({
              data: input.priceOptions.map((option, position) => ({
                serviceItemId: itemId,
                durationMinutes: option.durationMinutes,
                priceCents: BigInt(option.priceCents),
                position,
              })),
            });
          }
          updated = await transaction.serviceItem.findUniqueOrThrow({
            where: { id: itemId },
            include: { priceOptions: { orderBy: [{ position: "asc" }, { durationMinutes: "asc" }] } },
          });
          entityType = "service_item";
        } else if (input.type === "ADDON") {
          current = await this.findAddonItem(transaction, storeId, itemId);
          const changed = await transaction.addonItem.updateMany({
            where: { id: itemId, storeId, deletedAt: null, version: input.version },
            data: {
              ...(input.name === undefined ? {} : { name: input.name }),
              ...(input.shortName === undefined ? {} : { shortName: input.shortName }),
              ...(input.amountCents === undefined
                ? {}
                : { amountCents: BigInt(input.amountCents) }),
              ...(input.durationMinutes === undefined
                ? {}
                : { durationMinutes: input.durationMinutes }),
              ...(input.defaultCommissionBps === undefined
                ? {}
                : { defaultCommissionBps: input.defaultCommissionBps }),
              ...(input.position === undefined ? {} : { position: input.position }),
              ...(input.isEnabled === undefined
                ? {}
                : { isEnabled: input.isEnabled }),
              version: { increment: 1 },
            },
          });
          if (changed.count !== 1) {
            await this.throwItemConflict(transaction, storeId, itemId, input.type);
          }
          updated = await transaction.addonItem.findUniqueOrThrow({
            where: { id: itemId },
          });
          entityType = "addon_item";
        } else {
          current = await this.findDiscountItem(transaction, storeId, itemId);
          const changed = await transaction.discountItem.updateMany({
            where: { id: itemId, storeId, deletedAt: null, version: input.version },
            data: {
              ...(input.name === undefined ? {} : { name: input.name }),
              ...(input.shortName === undefined ? {} : { shortName: input.shortName }),
              ...(input.amountCents === undefined
                ? {}
                : { amountCents: BigInt(input.amountCents) }),
              ...(input.position === undefined ? {} : { position: input.position }),
              ...(input.isEnabled === undefined
                ? {}
                : { isEnabled: input.isEnabled }),
              version: { increment: 1 },
            },
          });
          if (changed.count !== 1) {
            await this.throwItemConflict(transaction, storeId, itemId, input.type);
          }
          updated = await transaction.discountItem.findUniqueOrThrow({
            where: { id: itemId },
          });
          entityType = "discount_item";
        }
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: manager.id,
            source: "api",
            action: "catalog.item_updated",
            entityType,
            entityId: itemId,
            beforeJson: toJsonSafe(current) as Prisma.InputJsonValue,
            afterJson: toJsonSafe(updated) as Prisma.InputJsonValue,
            requestId,
          },
        });
        return updated;
      },
    );
  }

  async deleteItem(
    actor: User,
    storeId: string,
    itemId: string,
    input: DeleteCatalogItemInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    return this.changeDeletedState(
      actor,
      storeId,
      itemId,
      input,
      true,
      idempotencyKey,
      requestId,
    );
  }

  async restoreItem(
    actor: User,
    storeId: string,
    itemId: string,
    input: RestoreCatalogItemInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    return this.changeDeletedState(
      actor,
      storeId,
      itemId,
      input,
      false,
      idempotencyKey,
      requestId,
    );
  }

  private async changeDeletedState(
    actor: User,
    storeId: string,
    itemId: string,
    input: DeleteCatalogItemInput | RestoreCatalogItemInput,
    deleting: boolean,
    idempotencyKey: string,
    requestId: string,
  ) {
    const manager = await this.access.requireCapability(
      actor.id,
      storeId,
      "CATALOG_MANAGE",
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: deleting
          ? "/api/v1/stores/:storeId/catalog/items/:itemId:delete"
          : "/api/v1/stores/:storeId/catalog/items/:itemId/restore",
        payload: { itemId, input },
        responseCode: 200,
      },
      async (transaction) => {
        const deletedAt = deleting ? null : { not: null };
        const data = deleting
          ? {
              isEnabled: false,
              deletedAt: new Date(),
              deletedBy: actor.id,
              deleteReason:
                "reason" in input ? input.reason : "由项目管理删除",
              version: { increment: 1 as const },
            }
          : {
              isEnabled: true,
              deletedAt: null,
              deletedBy: null,
              deleteReason: null,
              version: { increment: 1 as const },
            };
        let current: CatalogItemResult;
        let updated: CatalogItemResult;
        let entityType: string;
        if (input.type === "SERVICE") {
          current = await this.findServiceItem(transaction, storeId, itemId, false);
          const changed = await transaction.serviceItem.updateMany({
            where: { id: itemId, storeId, deletedAt, version: input.version },
            data,
          });
          if (changed.count !== 1) {
            await this.throwItemConflict(transaction, storeId, itemId, input.type);
          }
          updated = await transaction.serviceItem.findUniqueOrThrow({
            where: { id: itemId },
            include: { priceOptions: { orderBy: [{ position: "asc" }, { durationMinutes: "asc" }] } },
          });
          entityType = "service_item";
        } else if (input.type === "ADDON") {
          current = await this.findAddonItem(transaction, storeId, itemId, false);
          const changed = await transaction.addonItem.updateMany({
            where: { id: itemId, storeId, deletedAt, version: input.version },
            data,
          });
          if (changed.count !== 1) {
            await this.throwItemConflict(transaction, storeId, itemId, input.type);
          }
          updated = await transaction.addonItem.findUniqueOrThrow({ where: { id: itemId } });
          entityType = "addon_item";
        } else {
          current = await this.findDiscountItem(transaction, storeId, itemId, false);
          const changed = await transaction.discountItem.updateMany({
            where: { id: itemId, storeId, deletedAt, version: input.version },
            data,
          });
          if (changed.count !== 1) {
            await this.throwItemConflict(transaction, storeId, itemId, input.type);
          }
          updated = await transaction.discountItem.findUniqueOrThrow({ where: { id: itemId } });
          entityType = "discount_item";
        }
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: manager.id,
            source: "api",
            action: deleting ? "catalog.item_deleted" : "catalog.item_restored",
            entityType,
            entityId: itemId,
            beforeJson: toJsonSafe(current) as Prisma.InputJsonValue,
            afterJson: toJsonSafe(updated) as Prisma.InputJsonValue,
            ...(deleting && "reason" in input ? { reason: input.reason } : {}),
            requestId,
          },
        });
        return updated;
      },
    );
  }

  private async findServiceItem(
    transaction: Prisma.TransactionClient,
    storeId: string,
    itemId: string,
    activeOnly = true,
  ) {
    const item = await transaction.serviceItem.findFirst({
      where: { id: itemId, storeId, ...(activeOnly ? { deletedAt: null } : {}) },
      include: { priceOptions: { orderBy: [{ position: "asc" }, { durationMinutes: "asc" }] } },
    });
    if (!item) this.throwItemNotFound();
    return item;
  }

  private async findAddonItem(
    transaction: Prisma.TransactionClient,
    storeId: string,
    itemId: string,
    activeOnly = true,
  ) {
    const item = await transaction.addonItem.findFirst({
      where: { id: itemId, storeId, ...(activeOnly ? { deletedAt: null } : {}) },
    });
    if (!item) this.throwItemNotFound();
    return item;
  }

  private async findDiscountItem(
    transaction: Prisma.TransactionClient,
    storeId: string,
    itemId: string,
    activeOnly = true,
  ) {
    const item = await transaction.discountItem.findFirst({
      where: { id: itemId, storeId, ...(activeOnly ? { deletedAt: null } : {}) },
    });
    if (!item) this.throwItemNotFound();
    return item;
  }

  private async throwItemConflict(
    transaction: Prisma.TransactionClient,
    storeId: string,
    itemId: string,
    type: "SERVICE" | "ADDON" | "DISCOUNT",
  ): Promise<never> {
    const latest =
      type === "SERVICE"
        ? await transaction.serviceItem.findFirst({
            where: { id: itemId, storeId },
            include: { priceOptions: { orderBy: [{ position: "asc" }, { durationMinutes: "asc" }] } },
          })
        : type === "ADDON"
          ? await transaction.addonItem.findFirst({ where: { id: itemId, storeId } })
          : await transaction.discountItem.findFirst({ where: { id: itemId, storeId } });
    if (!latest) this.throwItemNotFound();
    throw new ConflictException({
      code: "CATALOG_ITEM_VERSION_CONFLICT",
      messageZh: "项目已被其他设备修改，请刷新后重试",
      latestResource: latest,
    });
  }

  private throwItemNotFound(): never {
    throw new NotFoundException({
      code: "CATALOG_ITEM_NOT_FOUND",
      messageZh: "没有找到该店铺项目",
    });
  }
}
