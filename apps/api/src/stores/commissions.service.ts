import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type User } from "@massage-note/database";
import type {
  SetEmployeeDefaultCommissionInput,
  SetEmployeeItemCommissionInput,
} from "@massage-note/contracts";
import { IdempotencyService } from "../common/idempotency.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "./store-access.service.js";

@Injectable()
export class CommissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoreAccessService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(actor: User, storeId: string, membershipId: string) {
    await this.access.requireCapability(actor.id, storeId, "CATALOG_MANAGE");
    const membership = await this.prisma.storeMembership.findFirst({
      where: { id: membershipId, storeId },
    });
    if (!membership) this.throwMembershipNotFound();
    const [defaultHistory, itemHistory] = await Promise.all([
      this.prisma.employeeDefaultCommission.findMany({
        where: { storeId, membershipId },
        orderBy: { effectiveFrom: "desc" },
      }),
      this.prisma.employeeItemCommission.findMany({
        where: { storeId, membershipId },
        orderBy: [{ itemType: "asc" }, { itemId: "asc" }, { effectiveFrom: "desc" }],
      }),
    ]);
    return { membership, defaultHistory, itemHistory };
  }

  async setDefault(
    actor: User,
    storeId: string,
    membershipId: string,
    input: SetEmployeeDefaultCommissionInput,
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
        route:
          "/api/v1/stores/:storeId/members/:membershipId/default-commission",
        payload: { membershipId, input },
        responseCode: 200,
      },
      async (transaction) => {
        const membership = await transaction.storeMembership.findFirst({
          where: { id: membershipId, storeId, deletedAt: null },
        });
        if (!membership) this.throwMembershipNotFound();
        const now = new Date();
        await transaction.employeeDefaultCommission.updateMany({
          where: { storeId, membershipId, effectiveTo: null },
          data: { effectiveTo: now },
        });
        const history =
          input.commissionBps === null
            ? null
            : await transaction.employeeDefaultCommission.create({
                data: {
                  storeId,
                  membershipId,
                  commissionBps: input.commissionBps,
                  effectiveFrom: now,
                  createdBy: actor.id,
                },
              });
        const changed = await transaction.storeMembership.updateMany({
          where: { id: membershipId, storeId, version: input.version },
          data: {
            defaultCommissionBps: input.commissionBps,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          await this.throwMembershipConflict(transaction, storeId, membershipId);
        }
        const updated = await transaction.storeMembership.findUniqueOrThrow({
          where: { id: membershipId },
        });
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: manager.id,
            source: "api",
            action: "commission.employee_default_changed",
            entityType: "store_membership",
            entityId: membershipId,
            beforeJson: {
              commissionBps: membership.defaultCommissionBps,
              version: membership.version,
            },
            afterJson: {
              commissionBps: updated.defaultCommissionBps,
              version: updated.version,
              effectiveFrom: history?.effectiveFrom.toISOString() ?? null,
            },
            requestId,
          },
        });
        return { membership: updated, history };
      },
    );
  }

  async setItem(
    actor: User,
    storeId: string,
    membershipId: string,
    input: SetEmployeeItemCommissionInput,
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
        route:
          "/api/v1/stores/:storeId/members/:membershipId/item-commission",
        payload: { membershipId, input },
        responseCode: 200,
      },
      async (transaction) => {
        const membership = await transaction.storeMembership.findFirst({
          where: { id: membershipId, storeId, deletedAt: null },
        });
        if (!membership) this.throwMembershipNotFound();
        const itemExists =
          input.itemType === "SERVICE"
            ? await transaction.serviceItem.findFirst({
                where: { id: input.itemId, storeId, deletedAt: null },
                select: { id: true },
              })
            : await transaction.addonItem.findFirst({
                where: { id: input.itemId, storeId, deletedAt: null },
                select: { id: true },
              });
        if (!itemExists) {
          throw new NotFoundException({
            code: "COMMISSION_ITEM_NOT_FOUND",
            messageZh: "提成项目不存在或已经删除",
          });
        }
        const now = new Date();
        await transaction.employeeItemCommission.updateMany({
          where: {
            storeId,
            membershipId,
            itemType: input.itemType,
            itemId: input.itemId,
            effectiveTo: null,
          },
          data: { effectiveTo: now },
        });
        const history =
          input.commissionBps === null
            ? null
            : await transaction.employeeItemCommission.create({
                data: {
                  storeId,
                  membershipId,
                  itemType: input.itemType,
                  itemId: input.itemId,
                  commissionBps: input.commissionBps,
                  effectiveFrom: now,
                  createdBy: actor.id,
                },
              });
        const changed = await transaction.storeMembership.updateMany({
          where: { id: membershipId, storeId, version: input.version },
          data: { version: { increment: 1 } },
        });
        if (changed.count !== 1) {
          await this.throwMembershipConflict(transaction, storeId, membershipId);
        }
        const updated = await transaction.storeMembership.findUniqueOrThrow({
          where: { id: membershipId },
        });
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: manager.id,
            source: "api",
            action: "commission.employee_item_changed",
            entityType: "store_membership",
            entityId: membershipId,
            beforeJson: {
              itemType: input.itemType,
              itemId: input.itemId,
              membershipVersion: membership.version,
            },
            afterJson: {
              itemType: input.itemType,
              itemId: input.itemId,
              commissionBps: input.commissionBps,
              membershipVersion: updated.version,
              effectiveFrom: history?.effectiveFrom.toISOString() ?? null,
            },
            requestId,
          },
        });
        return { membership: updated, history };
      },
    );
  }

  private async throwMembershipConflict(
    transaction: Prisma.TransactionClient,
    storeId: string,
    membershipId: string,
  ): Promise<never> {
    const latest = await transaction.storeMembership.findFirst({
      where: { id: membershipId, storeId },
    });
    if (!latest) this.throwMembershipNotFound();
    throw new ConflictException({
      code: "MEMBERSHIP_VERSION_CONFLICT",
      messageZh: "成员提成已被其他设备修改，请刷新后重试",
      latestResource: latest,
    });
  }

  private throwMembershipNotFound(): never {
    throw new NotFoundException({
      code: "MEMBERSHIP_NOT_FOUND",
      messageZh: "没有找到该店铺成员",
    });
  }
}
