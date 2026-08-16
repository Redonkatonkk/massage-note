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
import {
  businessDateFor,
  calculateWorkRecordFinance,
  multiplyByBps,
  resolveCommission,
  resolveCustomItemCommission,
} from "@massage-note/domain";
import { lockBusinessDay } from "../common/business-day-lock.js";
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
        const commissionChanged =
          membership.defaultCommissionBps !== input.commissionBps;
        if (commissionChanged) {
          await transaction.employeeDefaultCommission.updateMany({
            where: { storeId, membershipId, effectiveTo: null },
            data: { effectiveTo: now },
          });
        }
        const history =
          commissionChanged && input.commissionBps !== null
            ? await transaction.employeeDefaultCommission.create({
                data: {
                  storeId,
                  membershipId,
                  commissionBps: input.commissionBps,
                  effectiveFrom: now,
                  createdBy: actor.id,
                },
              })
            : null;
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
        if (commissionChanged) {
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
        }
        const refreshedCurrentDayRecordCount =
          await this.refreshCurrentBusinessDayRecords(
            transaction,
            storeId,
            membershipId,
            actor.id,
            manager.id,
            requestId,
          );
        return { membership: updated, history, refreshedCurrentDayRecordCount };
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
        const refreshedCurrentDayRecordCount =
          await this.refreshCurrentBusinessDayRecords(
            transaction,
            storeId,
            membershipId,
            actor.id,
            manager.id,
            requestId,
          );
        return { membership: updated, history, refreshedCurrentDayRecordCount };
      },
    );
  }

  private async refreshCurrentBusinessDayRecords(
    transaction: Prisma.TransactionClient,
    storeId: string,
    membershipId: string,
    actorUserId: string,
    actorMembershipId: string,
    requestId: string,
  ): Promise<number> {
    const store = await transaction.store.findFirst({
      where: { id: storeId, status: "ACTIVE", deletedAt: null },
      select: {
        timezone: true,
        businessCutoffLocal: true,
        globalCommissionBps: true,
      },
    });
    if (!store) return 0;
    const businessDate = businessDateFor({
      startAt: new Date(),
      timezone: store.timezone,
      cutoffLocal: store.businessCutoffLocal,
    });
    const businessDateValue = new Date(`${businessDate}T00:00:00.000Z`);
    await lockBusinessDay(transaction, storeId, businessDate);
    const activeClosing = await transaction.businessDayClosing.findFirst({
      where: { storeId, businessDate: businessDateValue, status: "CLOSED" },
      select: { id: true },
    });
    if (activeClosing) return 0;

    const [membership, records, activeItemCommissions] = await Promise.all([
      transaction.storeMembership.findFirst({
        where: { id: membershipId, storeId, deletedAt: null },
        select: { defaultCommissionBps: true },
      }),
      transaction.workRecord.findMany({
        where: {
          storeId,
          employeeMembershipId: membershipId,
          businessDate: businessDateValue,
          deletedAt: null,
        },
        include: {
          serviceSnapshot: true,
          addonSnapshots: { orderBy: { position: "asc" } },
          discountSnapshots: { orderBy: { position: "asc" } },
        },
      }),
      transaction.employeeItemCommission.findMany({
        where: { storeId, membershipId, effectiveTo: null },
        orderBy: { effectiveFrom: "asc" },
        select: { itemType: true, itemId: true, commissionBps: true },
      }),
    ]);
    if (!membership || records.length === 0) return 0;

    const serviceItemIds = records.flatMap((record) =>
      record.serviceSnapshot?.sourceServiceItemId
        ? [record.serviceSnapshot.sourceServiceItemId]
        : [],
    );
    const addonItemIds = records.flatMap((record) =>
      record.addonSnapshots.flatMap((addon) =>
        addon.sourceAddonItemId ? [addon.sourceAddonItemId] : [],
      ),
    );
    const [serviceItems, addonItems] = await Promise.all([
      transaction.serviceItem.findMany({
        where: { storeId, id: { in: [...new Set(serviceItemIds)] } },
        select: { id: true, defaultCommissionBps: true },
      }),
      transaction.addonItem.findMany({
        where: { storeId, id: { in: [...new Set(addonItemIds)] } },
        select: { id: true, defaultCommissionBps: true },
      }),
    ]);
    const serviceDefaults = new Map(
      serviceItems.map((item) => [item.id, item.defaultCommissionBps]),
    );
    const addonDefaults = new Map(
      addonItems.map((item) => [item.id, item.defaultCommissionBps]),
    );
    const employeeItemCommissions = new Map(
      activeItemCommissions.map((item) => [
        `${item.itemType}:${item.itemId}`,
        item.commissionBps,
      ]),
    );
    const resolveSnapshotCommission = (
      itemType: "SERVICE" | "ADDON",
      sourceItemId: string | null,
      currentBps: number,
      currentSource: string,
    ) => {
      if (currentSource === "MANAGER_OVERRIDE") {
        return { bps: currentBps, source: currentSource };
      }
      if (!sourceItemId) {
        return resolveCustomItemCommission({
          employeeDefaultBps: membership.defaultCommissionBps,
          storeDefaultBps: store.globalCommissionBps,
        });
      }
      return resolveCommission({
        employeeItemBps:
          employeeItemCommissions.get(`${itemType}:${sourceItemId}`) ?? null,
        employeeDefaultBps: membership.defaultCommissionBps,
        itemDefaultBps:
          itemType === "SERVICE"
            ? serviceDefaults.get(sourceItemId) ?? null
            : addonDefaults.get(sourceItemId) ?? null,
        storeDefaultBps: store.globalCommissionBps,
      });
    };

    const changedRecords: typeof records = [];
    for (const record of records) {
      if (!record.serviceSnapshot) continue;
      const serviceCommission = resolveSnapshotCommission(
        "SERVICE",
        record.serviceSnapshot.sourceServiceItemId,
        record.serviceSnapshot.commissionBps,
        record.serviceSnapshot.commissionSource,
      );
      const serviceWageCents = multiplyByBps(
        record.serviceSnapshot.amountCents,
        serviceCommission.bps,
      );
      const nextAddons = record.addonSnapshots.map((addon) => {
        const commission = resolveSnapshotCommission(
          "ADDON",
          addon.sourceAddonItemId,
          addon.commissionBps,
          addon.commissionSource,
        );
        return {
          ...addon,
          commissionBps: commission.bps,
          commissionSource: commission.source,
          wageCents: multiplyByBps(addon.amountCents, commission.bps),
        };
      });
      const finance = calculateWorkRecordFinance({
        mainServiceAmountCents: record.serviceSnapshot.amountCents,
        mainServiceCommissionBps: serviceCommission.bps,
        addons: nextAddons.map((addon) => ({
          amountCents: addon.amountCents,
          commissionBps: addon.commissionBps,
        })),
        discountAmountsCents: record.discountSnapshots.map(
          (discount) => discount.amountCents,
        ),
        cashServiceCents: record.cashServiceCents ?? 0n,
        cardServiceCents: record.cardServiceCents ?? 0n,
        cashTipCents: record.cashTipCents ?? 0n,
        cardTipCents: record.cardTipCents ?? 0n,
      });
      const snapshotsChanged =
        record.serviceSnapshot.commissionBps !== serviceCommission.bps ||
        record.serviceSnapshot.commissionSource !== serviceCommission.source ||
        record.serviceSnapshot.wageCents !== serviceWageCents ||
        nextAddons.some((addon, index) => {
          const current = record.addonSnapshots[index];
          return !current ||
            current.commissionBps !== addon.commissionBps ||
            current.commissionSource !== addon.commissionSource ||
            current.wageCents !== addon.wageCents;
        });
      const totalsChanged =
        record.mainServiceWageCents !== finance.mainServiceWageCents ||
        record.addonWageCents !== finance.addonWageCents ||
        record.totalLargeFeeWageCents !== finance.totalLargeFeeWageCents ||
        (record.status === "CONFIRMED" &&
          (record.employeeTotalIncomeCents !== finance.employeeTotalIncomeCents ||
            record.cashAllocatedServiceWageCents !==
              finance.cashAllocatedServiceWageCents ||
            record.cashAcquiredServiceWageCents !==
              finance.cashAcquiredServiceWageCents ||
            record.cashWageShortfallCents !== finance.cashWageShortfallCents));
      if (!snapshotsChanged && !totalsChanged) continue;

      await transaction.workRecordServiceSnapshot.update({
        where: { id: record.serviceSnapshot.id },
        data: {
          commissionBps: serviceCommission.bps,
          commissionSource: serviceCommission.source,
          wageCents: serviceWageCents,
        },
      });
      for (const addon of nextAddons) {
        await transaction.workRecordAddonSnapshot.update({
          where: { id: addon.id },
          data: {
            commissionBps: addon.commissionBps,
            commissionSource: addon.commissionSource,
            wageCents: addon.wageCents,
          },
        });
      }
      await transaction.workRecord.update({
        where: { id: record.id },
        data: {
          mainServiceWageCents: finance.mainServiceWageCents,
          addonWageCents: finance.addonWageCents,
          totalLargeFeeWageCents: finance.totalLargeFeeWageCents,
          ...(record.status === "CONFIRMED"
            ? {
                employeeTotalIncomeCents: finance.employeeTotalIncomeCents,
                cashAllocatedServiceWageCents:
                  finance.cashAllocatedServiceWageCents,
                cashAcquiredServiceWageCents:
                  finance.cashAcquiredServiceWageCents,
                cashWageShortfallCents: finance.cashWageShortfallCents,
              }
            : {}),
          updatedBy: actorUserId,
          version: { increment: 1 },
        },
      });
      await transaction.auditLog.create({
        data: {
          storeId,
          actorUserId,
          actorMembershipId,
          source: "system",
          action: "work_record.commission_refreshed",
          entityType: "work_record",
          entityId: record.id,
          businessDate: record.businessDate,
          beforeJson: {
            mainServiceCommissionBps:
              record.serviceSnapshot.commissionBps,
            totalLargeFeeWageCents:
              record.totalLargeFeeWageCents.toString(),
            version: record.version,
          },
          afterJson: {
            mainServiceCommissionBps: serviceCommission.bps,
            totalLargeFeeWageCents:
              finance.totalLargeFeeWageCents.toString(),
            version: record.version + 1,
          },
          reason: "当前营业日按最新员工提成设置重新计算",
          requestId,
        },
      });
      changedRecords.push(record);
    }

    if (changedRecords.length > 0) {
      await this.reopenCurrentDayCashSettlements(
        transaction,
        storeId,
        businessDateValue,
        actorUserId,
        actorMembershipId,
        requestId,
      );
    }
    return changedRecords.length;
  }

  private async reopenCurrentDayCashSettlements(
    transaction: Prisma.TransactionClient,
    storeId: string,
    businessDate: Date,
    actorUserId: string,
    actorMembershipId: string,
    requestId: string,
  ): Promise<void> {
    const settlements = await transaction.dailyCashSettlement.findMany({
      where: {
        storeId,
        businessDate,
        status: "SETTLED",
        deletedAt: null,
      },
    });
    if (settlements.length === 0) return;
    await transaction.dailyCashSettlement.updateMany({
      where: { id: { in: settlements.map((settlement) => settlement.id) } },
      data: {
        status: "UNSETTLED",
        settledBy: null,
        settledAt: null,
        version: { increment: 1 },
      },
    });
    for (const settlement of settlements) {
      await transaction.auditLog.create({
        data: {
          storeId,
          actorUserId,
          actorMembershipId,
          source: "system",
          action: "cash_settlement.reopened_automatically",
          entityType: "daily_cash_settlement",
          entityId: settlement.id,
          businessDate: settlement.businessDate,
          beforeJson: {
            status: settlement.status,
            settledAt: settlement.settledAt?.toISOString() ?? null,
            version: settlement.version,
          },
          afterJson: {
            status: "UNSETTLED",
            settledAt: null,
            version: settlement.version + 1,
          },
          reason: "当前营业日提成发生变化，需要重新确认现金结算",
          requestId,
        },
      });
    }
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
