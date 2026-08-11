import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { StoreMembership, User } from "@massage-note/database";
import { Prisma } from "@massage-note/database";
import type {
  ConfirmedPayment,
  CreateWorkRecordInput,
  DeleteWorkRecordInput,
  RestoreWorkRecordInput,
  UpdateWorkRecordInput,
} from "@massage-note/contracts";
import {
  DomainError,
  businessDateFor,
  calculateWorkRecordFinance,
  canWriteWorkRecord,
  hasStoreCapability,
  multiplyByBps,
  resolveCommission,
  resolveCustomItemCommission,
} from "@massage-note/domain";
import { PrismaService } from "../database/prisma.service.js";
import { lockBusinessDay } from "../common/business-day-lock.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";

interface StoreBusinessSettings {
  id: string;
  timezone: string;
  businessCutoffLocal: string;
  globalCommissionBps: number;
}

interface MondayThursdayAutoDiscountSettings {
  mondayThursdayAutoDiscountEnabled: boolean;
  mondayThursdayAutoDiscountThresholdCents: bigint;
  mondayThursdayAutoDiscountAmountCents: bigint;
}

interface DesiredServiceSnapshot {
  sourceServiceItemId: string | null;
  isCustom: boolean;
  name: string;
  shortName: string;
  amountCents: bigint;
  durationMinutes: number;
  commissionBps: number;
  commissionSource: string;
  wageCents: bigint;
}

interface DesiredAddonSnapshot {
  sourceAddonItemId: string | null;
  isCustom: boolean;
  name: string;
  shortName: string;
  amountCents: bigint;
  durationMinutes: number | null;
  commissionBps: number;
  commissionSource: string;
  wageCents: bigint;
  position: number;
}

interface DesiredDiscountSnapshot {
  sourceDiscountItemId: string | null;
  isCustom: boolean;
  isAutomatic: boolean;
  name: string;
  amountCents: bigint;
  position: number;
}

const MONDAY_THURSDAY_AUTO_DISCOUNT_NAME = "周一至周四自动折扣";

const recordInclude = {
  employee: {
    select: { id: true, displayName: true, role: true, isServiceProvider: true },
  },
  serviceSnapshot: true,
  addonSnapshots: { orderBy: { position: "asc" as const } },
  discountSnapshots: { orderBy: { position: "asc" as const } },
  payment: true,
};

@Injectable()
export class WorkRecordsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoreAccessService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async create(
    actor: User,
    storeId: string,
    input: CreateWorkRecordInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const actorMembership = await this.access.requireActiveMembership(
      actor.id,
      storeId,
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "/api/v1/stores/:storeId/work-records",
        payload: input,
        responseCode: 201,
      },
      async (transaction) => {
      const store = await transaction.store.findFirst({
        where: { id: storeId, status: "ACTIVE", deletedAt: null },
        select: {
          id: true,
          timezone: true,
          businessCutoffLocal: true,
          globalCommissionBps: true,
          mondayThursdayAutoDiscountEnabled: true,
          mondayThursdayAutoDiscountThresholdCents: true,
          mondayThursdayAutoDiscountAmountCents: true,
        },
      });
      if (!store) this.throwStoreNotFound();

      const employee = await transaction.storeMembership.findFirst({
        where: {
          id: input.employeeMembershipId,
          storeId,
          status: "ACTIVE",
          deletedAt: null,
          isServiceProvider: true,
        },
      });
      if (!employee) {
        throw new NotFoundException({
          code: "SERVICE_PROVIDER_NOT_FOUND",
          messageZh: "没有找到该店的在职服务人员",
        });
      }

      const startAt = new Date(input.startAt);
      const businessDate = businessDateFor({
        startAt,
        timezone: store.timezone,
        cutoffLocal: store.businessCutoffLocal,
      });
      await this.assertCanWrite(
        transaction,
        actorMembership,
        store,
        businessDate,
      );

      const employeeDefaultBps = await this.resolveEmployeeDefaultCommission(
        transaction,
        storeId,
        employee,
        startAt,
      );

      let sourceServiceItemId: string | null;
      let serviceName: string;
      let shortName: string;
      let amountCents: bigint;
      let durationMinutes: number;
      let commissionBps: number;
      let commissionSource: string;
      let isCustom: boolean;

      if (input.serviceItemId) {
        const { item, option } = await this.resolveServiceSelection(
          transaction,
          storeId,
          input.serviceItemId,
          input.serviceDurationMinutes,
        );
        const employeeItemBps = await this.resolveEmployeeItemCommission(
          transaction,
          storeId,
          employee.id,
          "SERVICE",
          item.id,
          startAt,
        );
        const commission = resolveCommission({
          employeeItemBps,
          itemDefaultBps: item.defaultCommissionBps,
          employeeDefaultBps,
          storeDefaultBps: store.globalCommissionBps,
        });
        sourceServiceItemId = item.id;
        serviceName = item.fullName;
        shortName = item.shortName;
        amountCents = option.priceCents;
        durationMinutes = option.durationMinutes;
        commissionBps = commission.bps;
        commissionSource = commission.source;
        isCustom = false;
      } else {
        const custom = input.customService;
        if (!custom) {
          throw new BadRequestException({
            code: "SERVICE_SELECTION_REQUIRED",
            messageZh: "请选择预设项目或填写自定义项目",
          });
        }
        const commission = resolveCustomItemCommission({
          employeeDefaultBps,
          storeDefaultBps: store.globalCommissionBps,
        });
        sourceServiceItemId = null;
        serviceName = custom.name;
        shortName = custom.shortName;
        amountCents = BigInt(custom.amountCents);
        durationMinutes = custom.durationMinutes;
        commissionBps = commission.bps;
        commissionSource = commission.source;
        isCustom = true;
      }

      const wageCents = multiplyByBps(amountCents, commissionBps);
      const discounts = this.applyMondayThursdayAutoDiscount(
        store,
        businessDate,
        amountCents,
        [],
      );
      const discountTotalCents = discounts.reduce(
        (total, discount) => total + discount.amountCents,
        0n,
      );
      const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
      const record = await transaction.workRecord.create({
        data: {
          storeId,
          employeeMembershipId: employee.id,
          businessDate: new Date(`${businessDate}T00:00:00.000Z`),
          storeTimezoneSnapshot: store.timezone,
          businessCutoffSnapshot: store.businessCutoffLocal,
          startAt,
          endAt,
          actualDurationMinutes: durationMinutes,
          status: "PENDING_PAYMENT",
          mainServiceAmountCents: amountCents,
          addonTotalCents: 0n,
          grossFeeBaseCents: amountCents,
          discountTotalCents,
          discountedFeePerformanceCents: amountCents - discountTotalCents,
          mainServiceWageCents: wageCents,
          addonWageCents: 0n,
          totalLargeFeeWageCents: wageCents,
          createdBy: actor.id,
          updatedBy: actor.id,
          serviceSnapshot: {
            create: {
              sourceServiceItemId,
              isCustom,
              name: serviceName,
              shortName,
              amountCents,
              durationMinutes,
              commissionBps,
              commissionSource,
              wageCents,
            },
          },
          ...(discounts.length === 0
            ? {}
            : {
                discountSnapshots: {
                  create: discounts,
                },
              }),
        },
        include: recordInclude,
      });
      await this.reopenCashSettlements(
        transaction,
        storeId,
        [businessDate],
        actor.id,
        actorMembership.id,
        requestId,
      );
      await transaction.auditLog.create({
        data: {
          storeId,
          actorUserId: actor.id,
          actorMembershipId: actorMembership.id,
          source: "api",
          action: isCustom
            ? "work_record.created_with_custom_service"
            : "work_record.created",
          entityType: "work_record",
          entityId: record.id,
          businessDate: record.businessDate,
          afterJson: {
            employeeMembershipId: employee.id,
            businessDate,
            startAt: startAt.toISOString(),
            endAt: endAt.toISOString(),
            serviceName,
            amountCents: amountCents.toString(),
            commissionBps,
            commissionSource,
            status: record.status,
            version: record.version,
          },
          requestId,
        },
      });
        return record;
      },
    );
  }

  async get(actor: User, storeId: string, recordId: string) {
    const actorMembership = await this.access.requireActiveMembership(
      actor.id,
      storeId,
    );
    const record = await this.prisma.workRecord.findFirst({
      where: { id: recordId, storeId, deletedAt: null },
      include: recordInclude,
    });
    if (!record) this.throwRecordNotFound();

    const currentBusinessDate = businessDateFor({
      startAt: new Date(),
      timezone: record.storeTimezoneSnapshot,
      cutoffLocal: record.businessCutoffSnapshot,
    });
    const recordDate = this.dateOnly(record.businessDate);
    const mayReadHistory =
      record.employeeMembershipId === actorMembership.id ||
      hasStoreCapability(actorMembership.role, "FINANCE_READ_STORE");
    if (recordDate !== currentBusinessDate && !mayReadHistory) {
      throw new ForbiddenException({
        code: "WORK_RECORD_HISTORY_FORBIDDEN",
        messageZh: "普通员工只能查看自己的历史记录",
      });
    }
    const auditTrail = await this.prisma.auditLog.findMany({
      where: {
        storeId,
        entityType: "work_record",
        entityId: recordId,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return { ...record, auditTrail };
  }

  async listDeleted(actor: User, storeId: string) {
    const membership = await this.access.requireActiveMembership(
      actor.id,
      storeId,
    );
    if (!hasStoreCapability(membership.role, "WORK_RECORD_WRITE_HISTORY")) {
      throw new ForbiddenException({
        code: "WORK_RECORD_RESTORE_FORBIDDEN",
        messageZh: "只有店长或经理可以查看和恢复已删除记工",
      });
    }
    return this.prisma.workRecord.findMany({
      where: { storeId, deletedAt: { not: null } },
      include: recordInclude,
      orderBy: [{ deletedAt: "desc" }, { startAt: "desc" }],
      take: 100,
    });
  }

  async update(
    actor: User,
    storeId: string,
    recordId: string,
    input: UpdateWorkRecordInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const actorMembership = await this.access.requireActiveMembership(
      actor.id,
      storeId,
    );
    const mayOverrideCommission = hasStoreCapability(
      actorMembership.role,
      "CATALOG_MANAGE",
    );
    try {
      return await this.idempotency.execute(
        {
          storeId,
          userId: actor.id,
          key: idempotencyKey,
          route: "/api/v1/stores/:storeId/work-records/:recordId",
          payload: { recordId, input },
          responseCode: 200,
        },
        async (transaction) => {
          const record = await transaction.workRecord.findFirst({
            where: { id: recordId, storeId, deletedAt: null },
            include: recordInclude,
          });
          if (!record) this.throwRecordNotFound();
          if (!record.serviceSnapshot) {
            throw new ConflictException({
              code: "SERVICE_SNAPSHOT_MISSING",
              messageZh: "记工缺少主要项目快照，无法修改",
            });
          }
          const store = await transaction.store.findFirst({
            where: { id: storeId, status: "ACTIVE", deletedAt: null },
            select: {
              id: true,
              timezone: true,
              businessCutoffLocal: true,
              globalCommissionBps: true,
              mondayThursdayAutoDiscountEnabled: true,
              mondayThursdayAutoDiscountThresholdCents: true,
              mondayThursdayAutoDiscountAmountCents: true,
            },
          });
          if (!store) this.throwStoreNotFound();
          const employee = await transaction.storeMembership.findFirst({
            where: {
              id: input.employeeMembershipId ?? record.employeeMembershipId,
              storeId,
              status: "ACTIVE",
              deletedAt: null,
              isServiceProvider: true,
            },
          });
          if (!employee) {
            throw new NotFoundException({
              code: "SERVICE_PROVIDER_NOT_FOUND",
              messageZh: "没有找到该店的在职服务人员",
            });
          }

          const startAt = input.startAt ? new Date(input.startAt) : record.startAt;
          const businessDate = businessDateFor({
            startAt,
            timezone: record.storeTimezoneSnapshot,
            cutoffLocal: record.businessCutoffSnapshot,
          });
          if (input.businessDate && input.businessDate !== businessDate) {
            throw new BadRequestException({
              code: "BUSINESS_DATE_MISMATCH",
              messageZh: "营业日必须由开始时间和店铺截止时间自动确定",
            });
          }
          const originalBusinessDate = this.dateOnly(record.businessDate);
          await this.assertCanWrite(
            transaction,
            actorMembership,
            {
              id: store.id,
              timezone: record.storeTimezoneSnapshot,
              businessCutoffLocal: record.businessCutoffSnapshot,
              globalCommissionBps: store.globalCommissionBps,
            },
            originalBusinessDate,
          );
          if (businessDate !== originalBusinessDate) {
          await this.assertCanWrite(
            transaction,
            actorMembership,
            {
              id: store.id,
              timezone: record.storeTimezoneSnapshot,
              businessCutoffLocal: record.businessCutoffSnapshot,
              globalCommissionBps: store.globalCommissionBps,
            },
            businessDate,
          );
          }
          const endAt =
            input.endAt === undefined
              ? record.endAt
              : input.endAt === null
                ? null
                : new Date(input.endAt);
          if (endAt && endAt < startAt) {
            throw new BadRequestException({
              code: "END_BEFORE_START",
              messageZh: "结束时间不能早于开始时间",
            });
          }
          const actualDurationMinutes = endAt
            ? Math.round((endAt.getTime() - startAt.getTime()) / 60_000)
            : null;
          const employeeDefaultBps = await this.resolveEmployeeDefaultCommission(
            transaction,
            storeId,
            employee,
            startAt,
          );
          const employeeOrTimeChanged =
            employee.id !== record.employeeMembershipId ||
            startAt.getTime() !== record.startAt.getTime();

          const service = await this.buildDesiredService(
            transaction,
            storeId,
            store.globalCommissionBps,
            employee,
            employeeDefaultBps,
            startAt,
            record.serviceSnapshot,
            input,
            employeeOrTimeChanged,
            mayOverrideCommission,
          );
          const addons = await this.buildDesiredAddons(
            transaction,
            storeId,
            store.globalCommissionBps,
            employee,
            employeeDefaultBps,
            startAt,
            record.addonSnapshots,
            input,
            employeeOrTimeChanged,
            mayOverrideCommission,
          );
          const manualDiscounts = await this.buildDesiredDiscounts(
            transaction,
            storeId,
            record.discountSnapshots,
            input,
          );
          const grossFeeBaseCents =
            service.amountCents +
            addons.reduce((total, addon) => total + addon.amountCents, 0n);
          const automaticDiscountSuppressed =
            input.automaticDiscountSuppressed ??
            record.automaticDiscountSuppressed;
          const discounts = automaticDiscountSuppressed
            ? manualDiscounts
            : this.applyMondayThursdayAutoDiscount(
                store,
                businessDate,
                grossFeeBaseCents,
                manualDiscounts,
              );
          let manualPriceFlag = record.manualPriceFlag;
          if (service.isCustom) {
            manualPriceFlag = false;
          } else if (input.serviceItemId || input.mainServiceAmountCents !== undefined) {
            const template = service.sourceServiceItemId
              ? await transaction.serviceItemPriceOption.findFirst({
                  where: {
                    serviceItemId: service.sourceServiceItemId,
                    durationMinutes: service.durationMinutes,
                    serviceItem: { storeId },
                  },
                  select: { priceCents: true },
                })
              : null;
            manualPriceFlag =
              template === null || template.priceCents !== service.amountCents;
          }

          if (record.status === "CONFIRMED") {
            if (
              record.cashServiceCents === null ||
              record.cardServiceCents === null ||
              record.cashTipCents === null ||
              record.cardTipCents === null
            ) {
              throw new ConflictException({
                code: "CONFIRMED_PAYMENT_MISSING",
                messageZh: "已确认记工缺少付款字段，无法重新计算",
              });
            }
          }
          const finance = calculateWorkRecordFinance({
            mainServiceAmountCents: service.amountCents,
            mainServiceCommissionBps: service.commissionBps,
            addons: addons.map((addon) => ({
              amountCents: addon.amountCents,
              commissionBps: addon.commissionBps,
            })),
            discountAmountsCents: discounts.map(
              (discount) => discount.amountCents,
            ),
            cashServiceCents: record.cashServiceCents ?? 0n,
            cardServiceCents: record.cardServiceCents ?? 0n,
            cashTipCents: record.cashTipCents ?? 0n,
            cardTipCents: record.cardTipCents ?? 0n,
          });
          this.assertJsonSafeMoney(finance);

          const changed = await transaction.workRecord.updateMany({
            where: {
              id: recordId,
              storeId,
              deletedAt: null,
              version: input.version,
            },
            data: {
              employeeMembershipId: employee.id,
              businessDate: new Date(`${businessDate}T00:00:00.000Z`),
              startAt,
              endAt,
              actualDurationMinutes,
              mainServiceAmountCents: finance.mainServiceAmountCents,
              addonTotalCents: finance.addonTotalCents,
              grossFeeBaseCents: finance.grossFeeBaseCents,
              discountTotalCents: finance.discountTotalCents,
              discountedFeePerformanceCents:
                finance.discountedFeePerformanceCents,
              mainServiceWageCents: finance.mainServiceWageCents,
              addonWageCents: finance.addonWageCents,
              totalLargeFeeWageCents: finance.totalLargeFeeWageCents,
              ...(record.status === "CONFIRMED"
                ? {
                    totalTipCents: finance.totalTipCents,
                    actualServiceCollectedCents:
                      finance.actualServiceCollectedCents,
                    customerTotalPaidCents: finance.customerTotalPaidCents,
                    paymentDifferenceCents: finance.paymentDifferenceCents,
                    employeeTotalIncomeCents: finance.employeeTotalIncomeCents,
                    cashAllocatedServiceWageCents:
                      finance.cashAllocatedServiceWageCents,
                    cashAcquiredServiceWageCents:
                      finance.cashAcquiredServiceWageCents,
                    cashWageShortfallCents: finance.cashWageShortfallCents,
                  }
                : {}),
              ...(input.note === undefined ? {} : { note: input.note }),
              ...(input.tipSettledManualFlag === undefined
                ? {}
                : { tipSettledManualFlag: input.tipSettledManualFlag }),
              ...(input.largeFeeSettledManualFlag === undefined
                ? {}
                : {
                    largeFeeSettledManualFlag:
                      input.largeFeeSettledManualFlag,
                  }),
              automaticDiscountSuppressed,
              manualPriceFlag,
              updatedBy: actor.id,
              version: { increment: 1 },
            },
          });
          if (changed.count !== 1) {
            await this.throwRecordConflict(transaction, recordId, storeId);
          }

          await transaction.workRecordServiceSnapshot.upsert({
            where: { workRecordId: recordId },
            create: { workRecordId: recordId, ...service },
            update: service,
          });
          await transaction.workRecordAddonSnapshot.deleteMany({
            where: { workRecordId: recordId },
          });
          if (addons.length > 0) {
            await transaction.workRecordAddonSnapshot.createMany({
              data: addons.map((addon) => ({ workRecordId: recordId, ...addon })),
            });
          }
          await transaction.workRecordDiscountSnapshot.deleteMany({
            where: { workRecordId: recordId },
          });
          if (discounts.length > 0) {
            await transaction.workRecordDiscountSnapshot.createMany({
              data: discounts.map((discount) => ({
                workRecordId: recordId,
                ...discount,
              })),
            });
          }
          const updated = await transaction.workRecord.findUniqueOrThrow({
            where: { id: recordId },
            include: recordInclude,
          });
          await this.reopenCashSettlements(
            transaction,
            storeId,
            [originalBusinessDate, businessDate],
            actor.id,
            actorMembership.id,
            requestId,
          );
          await transaction.auditLog.create({
            data: {
              storeId,
              actorUserId: actor.id,
              actorMembershipId: actorMembership.id,
              source: "api",
              action: "work_record.updated",
              entityType: "work_record",
              entityId: recordId,
              businessDate: updated.businessDate,
              beforeJson: {
                employeeMembershipId: record.employeeMembershipId,
                businessDate: this.dateOnly(record.businessDate),
                startAt: record.startAt.toISOString(),
                grossFeeBaseCents: record.grossFeeBaseCents.toString(),
                discountTotalCents: record.discountTotalCents.toString(),
                automaticDiscountSuppressed:
                  record.automaticDiscountSuppressed,
                version: record.version,
              },
              afterJson: {
                employeeMembershipId: updated.employeeMembershipId,
                businessDate,
                startAt: updated.startAt.toISOString(),
                grossFeeBaseCents: updated.grossFeeBaseCents.toString(),
                discountTotalCents: updated.discountTotalCents.toString(),
                automaticDiscountSuppressed:
                  updated.automaticDiscountSuppressed,
                version: updated.version,
              },
              requestId,
            },
          });
          return updated;
        },
      );
    } catch (error) {
      if (error instanceof DomainError) {
        throw new BadRequestException({ code: error.code, messageZh: error.message });
      }
      throw error;
    }
  }

  async remove(
    actor: User,
    storeId: string,
    recordId: string,
    input: DeleteWorkRecordInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const actorMembership = await this.access.requireActiveMembership(
      actor.id,
      storeId,
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "DELETE /api/v1/stores/:storeId/work-records/:recordId",
        payload: { recordId, input },
        responseCode: 200,
      },
      async (transaction) => {
        const record = await transaction.workRecord.findFirst({
          where: { id: recordId, storeId, deletedAt: null },
          include: recordInclude,
        });
        if (!record) this.throwRecordNotFound();
        await this.assertCanWrite(
          transaction,
          actorMembership,
          {
            id: storeId,
            timezone: record.storeTimezoneSnapshot,
            businessCutoffLocal: record.businessCutoffSnapshot,
            globalCommissionBps: 0,
          },
          this.dateOnly(record.businessDate),
        );
        const deletedAt = new Date();
        const changed = await transaction.workRecord.updateMany({
          where: {
            id: recordId,
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
          await this.throwRecordConflict(transaction, recordId, storeId);
        }
        const deleted = await transaction.workRecord.findUniqueOrThrow({
          where: { id: recordId },
          include: recordInclude,
        });
        await this.reopenCashSettlements(
          transaction,
          storeId,
          [this.dateOnly(record.businessDate)],
          actor.id,
          actorMembership.id,
          requestId,
        );
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: actorMembership.id,
            source: "api",
            action: "work_record.deleted",
            entityType: "work_record",
            entityId: recordId,
            businessDate: record.businessDate,
            beforeJson: {
              status: record.status,
              employeeMembershipId: record.employeeMembershipId,
              startAt: record.startAt.toISOString(),
              grossFeeBaseCents: record.grossFeeBaseCents.toString(),
              version: record.version,
            },
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
    recordId: string,
    input: RestoreWorkRecordInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const actorMembership = await this.access.requireActiveMembership(
      actor.id,
      storeId,
    );
    if (
      !hasStoreCapability(actorMembership.role, "WORK_RECORD_WRITE_HISTORY")
    ) {
      throw new ForbiddenException({
        code: "WORK_RECORD_RESTORE_FORBIDDEN",
        messageZh: "只有店长或经理可以恢复已删除记工",
      });
    }
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "/api/v1/stores/:storeId/work-records/:recordId/restore",
        payload: { recordId, input },
        responseCode: 200,
      },
      async (transaction) => {
        const record = await transaction.workRecord.findFirst({
          where: { id: recordId, storeId, deletedAt: { not: null } },
          include: recordInclude,
        });
        if (!record) this.throwRecordNotFound();
        await this.assertCanWrite(
          transaction,
          actorMembership,
          {
            id: storeId,
            timezone: record.storeTimezoneSnapshot,
            businessCutoffLocal: record.businessCutoffSnapshot,
            globalCommissionBps: 0,
          },
          this.dateOnly(record.businessDate),
        );
        const changed = await transaction.workRecord.updateMany({
          where: {
            id: recordId,
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
          await this.throwRecordConflict(transaction, recordId, storeId);
        }
        const restored = await transaction.workRecord.findUniqueOrThrow({
          where: { id: recordId },
          include: recordInclude,
        });
        await this.reopenCashSettlements(
          transaction,
          storeId,
          [this.dateOnly(record.businessDate)],
          actor.id,
          actorMembership.id,
          requestId,
        );
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: actorMembership.id,
            source: "api",
            action: "work_record.restored",
            entityType: "work_record",
            entityId: recordId,
            businessDate: record.businessDate,
            beforeJson: {
              deletedAt: record.deletedAt?.toISOString() ?? null,
              deletedBy: record.deletedBy,
              deleteReason: record.deleteReason,
              version: record.version,
            },
            afterJson: {
              deletedAt: null,
              deletedBy: null,
              deleteReason: null,
              version: restored.version,
            },
            requestId,
          },
        });
        return restored;
      },
    );
  }

  async confirmPayment(
    actor: User,
    storeId: string,
    recordId: string,
    input: ConfirmedPayment,
    idempotencyKey: string,
    requestId: string,
  ) {
    const actorMembership = await this.access.requireActiveMembership(
      actor.id,
      storeId,
    );
    try {
      return await this.idempotency.execute(
        {
          storeId,
          userId: actor.id,
          key: idempotencyKey,
          route:
            "/api/v1/stores/:storeId/work-records/:recordId/confirm-payment",
          payload: { recordId, input },
          responseCode: 200,
        },
        async (transaction) => {
        const record = await transaction.workRecord.findFirst({
          where: { id: recordId, storeId, deletedAt: null },
          include: recordInclude,
        });
        if (!record) this.throwRecordNotFound();

        const store: StoreBusinessSettings = {
          id: storeId,
          timezone: record.storeTimezoneSnapshot,
          businessCutoffLocal: record.businessCutoffSnapshot,
          globalCommissionBps: 0,
        };
        await this.assertCanWrite(
          transaction,
          actorMembership,
          store,
          this.dateOnly(record.businessDate),
        );
        if (!record.serviceSnapshot) {
          throw new ConflictException({
            code: "SERVICE_SNAPSHOT_MISSING",
            messageZh: "记工缺少主要项目快照，无法确认付款",
          });
        }

        const finance = calculateWorkRecordFinance({
          mainServiceAmountCents: record.serviceSnapshot.amountCents,
          mainServiceCommissionBps: record.serviceSnapshot.commissionBps,
          addons: record.addonSnapshots.map((addon) => ({
            amountCents: addon.amountCents,
            commissionBps: addon.commissionBps,
          })),
          discountAmountsCents: record.discountSnapshots.map(
            (discount) => discount.amountCents,
          ),
          cashServiceCents: BigInt(input.cashServiceCents),
          cardServiceCents: BigInt(input.cardServiceCents),
          cashTipCents: BigInt(input.cashTipCents),
          cardTipCents: BigInt(input.cardTipCents),
        });
        this.assertJsonSafeMoney(finance);

        const changed = await transaction.workRecord.updateMany({
          where: {
            id: recordId,
            storeId,
            deletedAt: null,
            version: input.version,
          },
          data: {
            status: "CONFIRMED",
            mainServiceAmountCents: finance.mainServiceAmountCents,
            addonTotalCents: finance.addonTotalCents,
            grossFeeBaseCents: finance.grossFeeBaseCents,
            discountTotalCents: finance.discountTotalCents,
            discountedFeePerformanceCents:
              finance.discountedFeePerformanceCents,
            cashServiceCents: finance.cashServiceCents,
            cardServiceCents: finance.cardServiceCents,
            cashTipCents: finance.cashTipCents,
            cardTipCents: finance.cardTipCents,
            totalTipCents: finance.totalTipCents,
            actualServiceCollectedCents: finance.actualServiceCollectedCents,
            customerTotalPaidCents: finance.customerTotalPaidCents,
            paymentDifferenceCents: finance.paymentDifferenceCents,
            mainServiceWageCents: finance.mainServiceWageCents,
            addonWageCents: finance.addonWageCents,
            totalLargeFeeWageCents: finance.totalLargeFeeWageCents,
            employeeTotalIncomeCents: finance.employeeTotalIncomeCents,
            cashAllocatedServiceWageCents:
              finance.cashAllocatedServiceWageCents,
            cashAcquiredServiceWageCents:
              finance.cashAcquiredServiceWageCents,
            cashWageShortfallCents: finance.cashWageShortfallCents,
            updatedBy: actor.id,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          await this.throwRecordConflict(transaction, recordId, storeId);
        }

        await transaction.paymentBreakdown.upsert({
          where: { workRecordId: recordId },
          create: {
            workRecordId: recordId,
            cashServiceCents: finance.cashServiceCents,
            cardServiceCents: finance.cardServiceCents,
            cashTipCents: finance.cashTipCents,
            cardTipCents: finance.cardTipCents,
            confirmedAt: new Date(),
            confirmedBy: actor.id,
          },
          update: {
            cashServiceCents: finance.cashServiceCents,
            cardServiceCents: finance.cardServiceCents,
            cashTipCents: finance.cashTipCents,
            cardTipCents: finance.cardTipCents,
            confirmedAt: new Date(),
            confirmedBy: actor.id,
            version: { increment: 1 },
          },
        });

        const updated = await transaction.workRecord.findUniqueOrThrow({
          where: { id: recordId },
          include: recordInclude,
        });
        await this.reopenCashSettlements(
          transaction,
          storeId,
          [this.dateOnly(record.businessDate)],
          actor.id,
          actorMembership.id,
          requestId,
        );
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: actorMembership.id,
            source: "api",
            action: "work_record.payment_confirmed",
            entityType: "work_record",
            entityId: recordId,
            businessDate: record.businessDate,
            beforeJson: {
              status: record.status,
              version: record.version,
            },
            afterJson: {
              status: updated.status,
              version: updated.version,
              cashServiceCents: finance.cashServiceCents.toString(),
              cardServiceCents: finance.cardServiceCents.toString(),
              cashTipCents: finance.cashTipCents.toString(),
              cardTipCents: finance.cardTipCents.toString(),
              actualServiceCollectedCents:
                finance.actualServiceCollectedCents.toString(),
              totalTipCents: finance.totalTipCents.toString(),
              employeeTotalIncomeCents:
                finance.employeeTotalIncomeCents.toString(),
              paymentDifferenceCents:
                finance.paymentDifferenceCents.toString(),
            },
            requestId,
          },
        });
          return updated;
        },
      );
    } catch (error) {
      if (error instanceof DomainError) {
        throw new BadRequestException({
          code: error.code,
          messageZh: error.message,
        });
      }
      throw error;
    }
  }

  private async buildDesiredService(
    transaction: Prisma.TransactionClient,
    storeId: string,
    storeDefaultBps: number,
    employee: StoreMembership,
    employeeDefaultBps: number | null,
    effectiveAt: Date,
    current: {
      sourceServiceItemId: string | null;
      isCustom: boolean;
      name: string;
      shortName: string;
      amountCents: bigint;
      durationMinutes: number;
      commissionBps: number;
      commissionSource: string;
    },
    input: UpdateWorkRecordInput,
    employeeOrTimeChanged: boolean,
    mayOverrideCommission: boolean,
  ): Promise<DesiredServiceSnapshot> {
    if (
      input.mainServiceCommissionBps !== undefined &&
      !mayOverrideCommission
    ) {
      throw new ForbiddenException({
        code: "COMMISSION_OVERRIDE_FORBIDDEN",
        messageZh: "普通员工不能修改提成比例",
      });
    }
    let sourceServiceItemId = current.sourceServiceItemId;
    let isCustom = current.isCustom;
    let name = current.name;
    let shortName = current.shortName;
    let amountCents = input.mainServiceAmountCents === undefined
      ? current.amountCents
      : BigInt(input.mainServiceAmountCents);
    let durationMinutes = current.durationMinutes;
    let commissionBps = current.commissionBps;
    let commissionSource = current.commissionSource;

    if (input.serviceItemId) {
      const { item, option } = await this.resolveServiceSelection(
        transaction,
        storeId,
        input.serviceItemId,
        input.serviceDurationMinutes,
      );
      const employeeItemBps = await this.resolveEmployeeItemCommission(
        transaction,
        storeId,
        employee.id,
        "SERVICE",
        item.id,
        effectiveAt,
      );
      const commission = resolveCommission({
        employeeItemBps,
        itemDefaultBps: item.defaultCommissionBps,
        employeeDefaultBps,
        storeDefaultBps,
      });
      sourceServiceItemId = item.id;
      isCustom = false;
      name = item.fullName;
      shortName = item.shortName;
      amountCents = input.mainServiceAmountCents === undefined
        ? option.priceCents
        : BigInt(input.mainServiceAmountCents);
      durationMinutes = option.durationMinutes;
      commissionBps = commission.bps;
      commissionSource = commission.source;
    } else if (input.customService) {
      const commission = resolveCustomItemCommission({
        employeeDefaultBps,
        storeDefaultBps,
      });
      sourceServiceItemId = null;
      isCustom = true;
      name = input.customService.name;
      shortName = input.customService.shortName;
      amountCents = input.mainServiceAmountCents === undefined
        ? BigInt(input.customService.amountCents)
        : BigInt(input.mainServiceAmountCents);
      durationMinutes = input.customService.durationMinutes;
      commissionBps = commission.bps;
      commissionSource = commission.source;
    } else if (employeeOrTimeChanged) {
      if (current.sourceServiceItemId) {
        const item = await transaction.serviceItem.findFirst({
          where: { id: current.sourceServiceItemId, storeId },
        });
        if (item) {
          const employeeItemBps = await this.resolveEmployeeItemCommission(
            transaction,
            storeId,
            employee.id,
            "SERVICE",
            item.id,
            effectiveAt,
          );
          const commission = resolveCommission({
            employeeItemBps,
            itemDefaultBps: item.defaultCommissionBps,
            employeeDefaultBps,
            storeDefaultBps,
          });
          commissionBps = commission.bps;
          commissionSource = commission.source;
        }
      } else {
        const commission = resolveCustomItemCommission({
          employeeDefaultBps,
          storeDefaultBps,
        });
        commissionBps = commission.bps;
        commissionSource = commission.source;
      }
    }

    if (input.mainServiceCommissionBps !== undefined) {
      commissionBps = input.mainServiceCommissionBps;
      commissionSource = "MANAGER_OVERRIDE";
    }

    return {
      sourceServiceItemId,
      isCustom,
      name,
      shortName,
      amountCents,
      durationMinutes,
      commissionBps,
      commissionSource,
      wageCents: multiplyByBps(amountCents, commissionBps),
    };
  }

  private async buildDesiredAddons(
    transaction: Prisma.TransactionClient,
    storeId: string,
    storeDefaultBps: number,
    employee: StoreMembership,
    employeeDefaultBps: number | null,
    effectiveAt: Date,
    current: Array<{
      sourceAddonItemId: string | null;
      isCustom: boolean;
      name: string;
      shortName: string;
      amountCents: bigint;
      durationMinutes: number | null;
      commissionBps: number;
      commissionSource: string;
      position: number;
    }>,
    input: UpdateWorkRecordInput,
    employeeOrTimeChanged: boolean,
    mayOverrideCommission: boolean,
  ): Promise<DesiredAddonSnapshot[]> {
    if (input.addons === undefined) {
      const result: DesiredAddonSnapshot[] = [];
      for (const addon of current) {
        let commissionBps = addon.commissionBps;
        let commissionSource = addon.commissionSource;
        if (employeeOrTimeChanged) {
          if (addon.sourceAddonItemId) {
            const item = await transaction.addonItem.findFirst({
              where: { id: addon.sourceAddonItemId, storeId },
            });
            if (item) {
              const employeeItemBps = await this.resolveEmployeeItemCommission(
                transaction,
                storeId,
                employee.id,
                "ADDON",
                item.id,
                effectiveAt,
              );
              const commission = resolveCommission({
                employeeItemBps,
                itemDefaultBps: item.defaultCommissionBps,
                employeeDefaultBps,
                storeDefaultBps,
              });
              commissionBps = commission.bps;
              commissionSource = commission.source;
            }
          } else {
            const commission = resolveCustomItemCommission({
              employeeDefaultBps,
              storeDefaultBps,
            });
            commissionBps = commission.bps;
            commissionSource = commission.source;
          }
        }
        result.push({
          ...addon,
          commissionBps,
          commissionSource,
          wageCents: multiplyByBps(addon.amountCents, commissionBps),
        });
      }
      return result;
    }

    const result: DesiredAddonSnapshot[] = [];
    for (const [position, addon] of input.addons.entries()) {
      if (addon.commissionBps !== undefined && !mayOverrideCommission) {
        throw new ForbiddenException({
          code: "COMMISSION_OVERRIDE_FORBIDDEN",
          messageZh: "普通员工不能修改提成比例",
        });
      }
      let sourceAddonItemId: string | null = null;
      let name = addon.name;
      let shortName = addon.shortName;
      let durationMinutes = addon.durationMinutes ?? null;
      let defaultBps: number | null = null;
      if (!addon.isCustom) {
        if (!addon.sourceItemId) {
          throw new BadRequestException({
            code: "ADDON_SOURCE_REQUIRED",
            messageZh: "预设额外项目必须提供项目编号",
          });
        }
        const item = await transaction.addonItem.findFirst({
          where: {
            id: addon.sourceItemId,
            storeId,
            isEnabled: true,
            deletedAt: null,
          },
        });
        if (!item) {
          throw new NotFoundException({
            code: "ADDON_ITEM_NOT_FOUND",
            messageZh: "额外项目不存在或已经停用",
          });
        }
        sourceAddonItemId = item.id;
        name = item.name;
        shortName = item.shortName;
        durationMinutes = item.durationMinutes;
        defaultBps = item.defaultCommissionBps;
      }
      const employeeItemBps = sourceAddonItemId
        ? await this.resolveEmployeeItemCommission(
            transaction,
            storeId,
            employee.id,
            "ADDON",
            sourceAddonItemId,
            effectiveAt,
          )
        : null;
      const commission =
        addon.commissionBps !== undefined
          ? { bps: addon.commissionBps, source: "MANAGER_OVERRIDE" }
          : sourceAddonItemId
            ? resolveCommission({
                employeeItemBps,
                itemDefaultBps: defaultBps,
                employeeDefaultBps,
                storeDefaultBps,
              })
            : resolveCustomItemCommission({
                employeeDefaultBps,
                storeDefaultBps,
              });
      const amountCents = BigInt(addon.amountCents);
      result.push({
        sourceAddonItemId,
        isCustom: addon.isCustom,
        name,
        shortName,
        amountCents,
        durationMinutes,
        commissionBps: commission.bps,
        commissionSource: commission.source,
        wageCents: multiplyByBps(amountCents, commission.bps),
        position,
      });
    }
    return result;
  }

  private async buildDesiredDiscounts(
    transaction: Prisma.TransactionClient,
    storeId: string,
    current: DesiredDiscountSnapshot[],
    input: UpdateWorkRecordInput,
  ): Promise<DesiredDiscountSnapshot[]> {
    if (input.discounts === undefined) {
      return current
        .filter((discount) => !discount.isAutomatic)
        .map((discount, position) => ({ ...discount, position }));
    }
    const result: DesiredDiscountSnapshot[] = [];
    for (const [position, discount] of input.discounts.entries()) {
      let sourceDiscountItemId: string | null = null;
      let name = discount.name;
      if (!discount.isCustom) {
        if (!discount.sourceItemId) {
          throw new BadRequestException({
            code: "DISCOUNT_SOURCE_REQUIRED",
            messageZh: "预设折扣必须提供项目编号",
          });
        }
        const item = await transaction.discountItem.findFirst({
          where: {
            id: discount.sourceItemId,
            storeId,
            isEnabled: true,
            deletedAt: null,
          },
        });
        if (!item) {
          throw new NotFoundException({
            code: "DISCOUNT_ITEM_NOT_FOUND",
            messageZh: "折扣项目不存在或已经停用",
          });
        }
        sourceDiscountItemId = item.id;
        name = item.name;
      }
      result.push({
        sourceDiscountItemId,
        isCustom: discount.isCustom,
        isAutomatic: false,
        name,
        amountCents: BigInt(discount.amountCents),
        position,
      });
    }
    return result;
  }

  private applyMondayThursdayAutoDiscount(
    settings: MondayThursdayAutoDiscountSettings,
    businessDate: string,
    grossFeeBaseCents: bigint,
    manualDiscounts: DesiredDiscountSnapshot[],
  ): DesiredDiscountSnapshot[] {
    const discounts = manualDiscounts.map((discount, position) => ({
      ...discount,
      isAutomatic: false,
      position,
    }));
    const weekday = new Date(`${businessDate}T00:00:00.000Z`).getUTCDay();
    const isMondayThroughThursday = weekday >= 1 && weekday <= 4;
    const threshold = settings.mondayThursdayAutoDiscountThresholdCents;
    const amount = settings.mondayThursdayAutoDiscountAmountCents;
    if (
      !settings.mondayThursdayAutoDiscountEnabled ||
      !isMondayThroughThursday ||
      threshold <= 0n ||
      amount <= 0n ||
      amount > threshold ||
      grossFeeBaseCents < threshold
    ) {
      return discounts;
    }
    return [
      ...discounts,
      {
        sourceDiscountItemId: null,
        isCustom: false,
        isAutomatic: true,
        name: MONDAY_THURSDAY_AUTO_DISCOUNT_NAME,
        amountCents: amount,
        position: discounts.length,
      },
    ];
  }

  private async reopenCashSettlements(
    transaction: Prisma.TransactionClient,
    storeId: string,
    businessDates: string[],
    actorUserId: string,
    actorMembershipId: string,
    requestId: string,
  ): Promise<number> {
    const uniqueDates = [...new Set(businessDates)].map(
      (date) => new Date(`${date}T00:00:00.000Z`),
    );
    const settlements = await transaction.dailyCashSettlement.findMany({
      where: {
        storeId,
        businessDate: { in: uniqueDates },
        status: "SETTLED",
        deletedAt: null,
      },
    });
    if (settlements.length === 0) return 0;
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
          reason: "相关记工发生变化，需要重新确认现金结算",
          requestId,
        },
      });
    }
    return settlements.length;
  }

  private async resolveEmployeeDefaultCommission(
    transaction: Prisma.TransactionClient,
    storeId: string,
    employee: StoreMembership,
    effectiveAt: Date,
  ): Promise<number | null> {
    const history = await transaction.employeeDefaultCommission.findFirst({
      where: {
        storeId,
        membershipId: employee.id,
        effectiveFrom: { lte: effectiveAt },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveAt } }],
      },
      orderBy: { effectiveFrom: "desc" },
      select: { commissionBps: true },
    });
    return history?.commissionBps ?? employee.defaultCommissionBps;
  }

  private async resolveEmployeeItemCommission(
    transaction: Prisma.TransactionClient,
    storeId: string,
    membershipId: string,
    itemType: "SERVICE" | "ADDON",
    itemId: string,
    effectiveAt: Date,
  ): Promise<number | null> {
    const history = await transaction.employeeItemCommission.findFirst({
      where: {
        storeId,
        membershipId,
        itemType,
        itemId,
        effectiveFrom: { lte: effectiveAt },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: effectiveAt } }],
      },
      orderBy: { effectiveFrom: "desc" },
      select: { commissionBps: true },
    });
    return history?.commissionBps ?? null;
  }

  private async assertCanWrite(
    transaction: Prisma.TransactionClient,
    actorMembership: StoreMembership,
    store: StoreBusinessSettings,
    businessDate: string,
  ): Promise<void> {
    await lockBusinessDay(transaction, store.id, businessDate);
    const closing = await transaction.businessDayClosing.findFirst({
      where: {
        storeId: store.id,
        businessDate: new Date(`${businessDate}T00:00:00.000Z`),
        status: "CLOSED",
      },
      select: { id: true },
    });
    if (closing) {
      throw new ConflictException({
        code: "BUSINESS_DAY_CLOSED",
        messageZh: "该营业日已经日结，请先取消日结再修改记工",
      });
    }
    const currentBusinessDate = businessDateFor({
      startAt: new Date(),
      timezone: store.timezone,
      cutoffLocal: store.businessCutoffLocal,
    });
    if (
      !canWriteWorkRecord({
        role: actorMembership.role,
        isCurrentBusinessDay: currentBusinessDate === businessDate,
        isDayClosed: false,
      })
    ) {
      throw new ForbiddenException({
        code: "WORK_RECORD_WRITE_FORBIDDEN",
        messageZh: "普通员工只能修改当前营业日的记工",
      });
    }
  }

  private async throwRecordConflict(
    transaction: Prisma.TransactionClient,
    recordId: string,
    storeId: string,
  ): Promise<never> {
    const latest = await transaction.workRecord.findFirst({
      where: { id: recordId, storeId },
      include: recordInclude,
    });
    if (!latest) this.throwRecordNotFound();
    throw new ConflictException({
      code: "WORK_RECORD_VERSION_CONFLICT",
      messageZh: "记工已被其他设备修改，请刷新后重试",
      latestResource: latest,
    });
  }

  private async resolveServiceSelection(
    transaction: Prisma.TransactionClient,
    storeId: string,
    serviceItemId: string,
    durationMinutes?: number,
  ) {
    const item = await transaction.serviceItem.findFirst({
      where: {
        id: serviceItemId,
        storeId,
        isEnabled: true,
        deletedAt: null,
      },
      include: {
        priceOptions: {
          orderBy: [{ position: "asc" }, { durationMinutes: "asc" }],
        },
      },
    });
    if (!item) {
      throw new NotFoundException({
        code: "SERVICE_ITEM_NOT_FOUND",
        messageZh: "主要项目不存在或已经停用",
      });
    }
    const option = durationMinutes === undefined
      ? item.priceOptions.length === 1
        ? item.priceOptions[0]
        : undefined
      : item.priceOptions.find(
          (candidate) => candidate.durationMinutes === durationMinutes,
        );
    if (!option) {
      throw new BadRequestException({
        code: "SERVICE_PRICE_OPTION_REQUIRED",
        messageZh:
          durationMinutes === undefined
            ? "请选择该项目的服务时长"
            : "该项目没有这个时长价格，请刷新后重新选择",
      });
    }
    return { item, option };
  }

  private dateOnly(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

  private assertJsonSafeMoney(value: object): void {
    const maximum = BigInt(Number.MAX_SAFE_INTEGER);
    const minimum = BigInt(Number.MIN_SAFE_INTEGER);
    if (
      Object.values(value).some(
        (entry) =>
          typeof entry === "bigint" && (entry > maximum || entry < minimum),
      )
    ) {
      throw new BadRequestException({
        code: "AMOUNT_TOTAL_TOO_LARGE",
        messageZh: "金额合计超出系统允许范围，请检查输入",
      });
    }
  }

  private throwStoreNotFound(): never {
    throw new NotFoundException({
      code: "STORE_NOT_FOUND",
      messageZh: "店铺不存在或已停用",
    });
  }

  private throwRecordNotFound(): never {
    throw new NotFoundException({
      code: "WORK_RECORD_NOT_FOUND",
      messageZh: "没有找到该记工记录",
    });
  }
}
