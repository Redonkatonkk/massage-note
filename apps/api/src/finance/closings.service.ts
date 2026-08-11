import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type User } from "@massage-note/database";
import type {
  CancelBusinessDayClosingInput,
  CloseBusinessDayInput,
} from "@massage-note/contracts";
import {
  businessDateFor,
  calculateDailyCashSettlement,
  canReadEmployeeFinance,
} from "@massage-note/domain";
import { lockBusinessDay } from "../common/business-day-lock.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";

const dateAtUtc = (date: string) => new Date(`${date}T00:00:00.000Z`);

interface PreviewWarning {
  code: string;
  labelZh: string;
  count: number;
  recordIds: string[];
}

type FinanceClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class ClosingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoreAccessService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async preview(actor: User, storeId: string, businessDate: string) {
    await this.access.requireCapability(actor.id, storeId, "DAY_CLOSE_MANAGE");
    return this.buildPreview(this.prisma, storeId, businessDate);
  }

  async previewMember(
    actor: User,
    storeId: string,
    businessDate: string,
    targetMembershipId: string,
  ) {
    const actorMembership = await this.access.requireActiveMembership(
      actor.id,
      storeId,
    );
    if (
      !canReadEmployeeFinance({
        role: actorMembership.role,
        actorMembershipId: actorMembership.id,
        targetMembershipId,
      })
    ) {
      throw new ForbiddenException({
        code: "EMPLOYEE_CLOSING_SCOPE_FORBIDDEN",
        messageZh: "员工只能查看自己的日结信息",
      });
    }
    const target = await this.prisma.storeMembership.findFirst({
      where: {
        id: targetMembershipId,
        storeId,
        status: "ACTIVE",
        deletedAt: null,
      },
      include: { store: { select: { name: true } } },
    });
    if (!target) {
      throw new NotFoundException({
        code: "CLOSING_MEMBERSHIP_NOT_FOUND",
        messageZh: "没有找到这位在职员工",
      });
    }
    const preview = await this.buildPreview(
      this.prisma,
      storeId,
      businessDate,
      targetMembershipId,
    );
    const employee = preview.employees[0] ?? {
      membershipId: target.id,
      displayName: target.displayName,
      role: target.role,
      recordCount: 0,
      grossFeeBaseCents: 0,
      discountTotalCents: 0,
      discountedFeePerformanceCents: 0,
      totalTipCents: 0,
      customerTotalPaidCents: 0,
      totalLargeFeeWageCents: 0,
      employeeIncomeCents: 0,
      cashToSubmitToStoreCents: 0,
      incompleteRecordCount: 0,
    };
    const activeClosing = preview.activeClosing
      ? {
          id: preview.activeClosing.id,
          cycleNo: preview.activeClosing.cycleNo,
          status: preview.activeClosing.status,
          isForced: preview.activeClosing.isForced,
          version: preview.activeClosing.version,
          closedAt: preview.activeClosing.closedAt,
        }
      : null;
    return {
      storeId,
      storeName: target.store.name,
      businessDate,
      isClosed: preview.isClosed,
      activeClosing,
      hasWarnings: preview.hasWarnings,
      warningCount: preview.warningCount,
      warnings: preview.warnings,
      employee,
    };
  }

  async close(
    actor: User,
    storeId: string,
    businessDate: string,
    input: CloseBusinessDayInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const membership = await this.access.requireCapability(
      actor.id,
      storeId,
      "DAY_CLOSE_MANAGE",
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "/api/v1/stores/:storeId/closings/:date",
        payload: { businessDate, input },
        responseCode: 201,
      },
      async (transaction) => {
        await lockBusinessDay(transaction, storeId, businessDate);
        const active = await transaction.businessDayClosing.findFirst({
          where: {
            storeId,
            businessDate: dateAtUtc(businessDate),
            status: "CLOSED",
          },
        });
        if (active) {
          throw new ConflictException({
            code: "BUSINESS_DAY_ALREADY_CLOSED",
            messageZh: "该营业日已经日结",
            latestResource: active,
          });
        }
        const preview = await this.buildPreview(
          transaction,
          storeId,
          businessDate,
        );
        if (preview.hasWarnings && !input.force) {
          throw new ConflictException({
            code: "CLOSING_WARNINGS_REQUIRE_FORCE",
            messageZh: "日结检查发现异常，请处理后重试，或填写原因后强制日结",
            latestResource: preview,
          });
        }
        const cycle = await transaction.businessDayClosing.aggregate({
          where: { storeId, businessDate: dateAtUtc(businessDate) },
          _max: { cycleNo: true },
        });
        const closing = await transaction.businessDayClosing.create({
          data: {
            storeId,
            businessDate: dateAtUtc(businessDate),
            cycleNo: (cycle._max.cycleNo ?? 0) + 1,
            status: "CLOSED",
            isForced: input.force,
            forceReason: input.forceReason ?? null,
            warningSnapshotJson: preview.warnings as unknown as Prisma.InputJsonValue,
            totalsSnapshotJson: {
              store: preview.storeTotals,
              employees: preview.employees,
            } as unknown as Prisma.InputJsonValue,
            closedBy: actor.id,
          },
        });
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: membership.id,
            source: "api",
            action: input.force
              ? "business_day.force_closed"
              : "business_day.closed",
            entityType: "business_day_closing",
            entityId: closing.id,
            businessDate: closing.businessDate,
            afterJson: {
              cycleNo: closing.cycleNo,
              isForced: closing.isForced,
              forceReason: closing.forceReason,
              warningCount: preview.warningCount,
              storeTotals: preview.storeTotals,
              version: closing.version,
            },
            reason: input.forceReason ?? null,
            requestId,
          },
        });
        return { closing, preview };
      },
    );
  }

  async cancel(
    actor: User,
    storeId: string,
    businessDate: string,
    input: CancelBusinessDayClosingInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const membership = await this.access.requireCapability(
      actor.id,
      storeId,
      "DAY_CLOSE_MANAGE",
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "/api/v1/stores/:storeId/closings/:date/cancel",
        payload: { businessDate, input },
        responseCode: 200,
      },
      async (transaction) => {
        await lockBusinessDay(transaction, storeId, businessDate);
        const current = await transaction.businessDayClosing.findFirst({
          where: {
            storeId,
            businessDate: dateAtUtc(businessDate),
            status: "CLOSED",
          },
        });
        if (!current) {
          throw new NotFoundException({
            code: "ACTIVE_CLOSING_NOT_FOUND",
            messageZh: "该营业日当前没有有效日结",
          });
        }
        const cancelledAt = new Date();
        const changed = await transaction.businessDayClosing.updateMany({
          where: { id: current.id, status: "CLOSED", version: input.version },
          data: {
            status: "CANCELLED",
            cancelledBy: actor.id,
            cancelledAt,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          const latest = await transaction.businessDayClosing.findUnique({
            where: { id: current.id },
          });
          throw new ConflictException({
            code: "CLOSING_VERSION_CONFLICT",
            messageZh: "日结状态已发生变化，请刷新后重试",
            latestResource: latest,
          });
        }
        const reopened = await transaction.dailyCashSettlement.updateMany({
          where: {
            storeId,
            businessDate: dateAtUtc(businessDate),
            status: "SETTLED",
            deletedAt: null,
          },
          data: {
            status: "UNSETTLED",
            settledBy: null,
            settledAt: null,
            version: { increment: 1 },
          },
        });
        const cancelled = await transaction.businessDayClosing.findUniqueOrThrow({
          where: { id: current.id },
        });
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: membership.id,
            source: "api",
            action: "business_day.closing_cancelled",
            entityType: "business_day_closing",
            entityId: current.id,
            businessDate: current.businessDate,
            beforeJson: {
              status: current.status,
              cycleNo: current.cycleNo,
              version: current.version,
            },
            afterJson: {
              status: cancelled.status,
              cancelledAt: cancelledAt.toISOString(),
              reopenedCashSettlementCount: reopened.count,
              version: cancelled.version,
            },
            reason: input.reason,
            requestId,
          },
        });
        return { closing: cancelled, reopenedCashSettlementCount: reopened.count };
      },
    );
  }

  private async buildPreview(
    client: FinanceClient,
    storeId: string,
    businessDate: string,
    membershipId?: string,
  ) {
    const store = await client.store.findFirst({
      where: { id: storeId, status: "ACTIVE", deletedAt: null },
      select: { id: true, timezone: true, businessCutoffLocal: true },
    });
    if (!store) {
      throw new NotFoundException({
        code: "STORE_NOT_FOUND",
        messageZh: "店铺不存在或已停用",
      });
    }
    const currentDate = businessDateFor({
      startAt: new Date(),
      timezone: store.timezone,
      cutoffLocal: store.businessCutoffLocal,
    });
    if (businessDate > currentDate) {
      throw new BadRequestException({
        code: "FUTURE_BUSINESS_DAY",
        messageZh: "不能对未来营业日进行日结",
      });
    }
    const [records, activeClosing] = await Promise.all([
      client.workRecord.findMany({
        where: {
          storeId,
          businessDate: dateAtUtc(businessDate),
          deletedAt: null,
          ...(membershipId ? { employeeMembershipId: membershipId } : {}),
        },
        orderBy: { startAt: "asc" },
        include: {
          employee: { select: { id: true, displayName: true, role: true } },
        },
      }),
      client.businessDayClosing.findFirst({
        where: {
          storeId,
          businessDate: dateAtUtc(businessDate),
          status: "CLOSED",
        },
      }),
    ]);

    const warningDefinitions: Array<{
      code: string;
      labelZh: string;
      matches: (record: (typeof records)[number]) => boolean;
    }> = [
      {
        code: "PENDING_PAYMENT",
        labelZh: "待结账记录",
        matches: (record) => record.status === "PENDING_PAYMENT",
      },
      {
        code: "TIP_MISSING",
        labelZh: "小费尚未确认",
        matches: (record) => record.totalTipCents === null,
      },
      {
        code: "PAYMENT_MISMATCH",
        labelZh: "实收大费与折后大费不一致",
        matches: (record) =>
          record.status === "CONFIRMED" && record.paymentDifferenceCents !== 0n,
      },
      {
        code: "MANUAL_PRICE",
        labelZh: "手动改价记录",
        matches: (record) => record.manualPriceFlag,
      },
      {
        code: "END_TIME_MISSING",
        labelZh: "未填写结束时间",
        matches: (record) => record.endAt === null,
      },
    ];
    const warnings: PreviewWarning[] = warningDefinitions
      .map((warning) => {
        const recordIds = records.filter(warning.matches).map((record) => record.id);
        return { code: warning.code, labelZh: warning.labelZh, count: recordIds.length, recordIds };
      })
      .filter((warning) => warning.count > 0);

    const employeeMap = new Map<
      string,
      {
        membershipId: string;
        displayName: string;
        role: string;
        recordCount: number;
        grossFeeBaseCents: bigint;
        discountTotalCents: bigint;
        discountedFeePerformanceCents: bigint;
        totalTipCents: bigint;
        customerTotalPaidCents: bigint;
        totalLargeFeeWageCents: bigint;
        employeeIncomeCents: bigint;
        cashRecords: Array<{
          cashServiceCents: bigint;
          cashTipCents: bigint;
          cashAllocatedServiceWageCents: bigint;
          cashAcquiredServiceWageCents: bigint;
          cashWageShortfallCents: bigint;
        }>;
        incompleteRecordCount: number;
      }
    >();
    for (const record of records) {
      const current = employeeMap.get(record.employeeMembershipId) ?? {
        membershipId: record.employeeMembershipId,
        displayName: record.employee.displayName,
        role: record.employee.role,
        recordCount: 0,
        grossFeeBaseCents: 0n,
        discountTotalCents: 0n,
        discountedFeePerformanceCents: 0n,
        totalTipCents: 0n,
        customerTotalPaidCents: 0n,
        totalLargeFeeWageCents: 0n,
        employeeIncomeCents: 0n,
        cashRecords: [],
        incompleteRecordCount: 0,
      };
      current.recordCount += 1;
      current.grossFeeBaseCents += record.grossFeeBaseCents;
      current.discountTotalCents += record.discountTotalCents;
      current.discountedFeePerformanceCents +=
        record.discountedFeePerformanceCents;
      current.totalTipCents += record.totalTipCents ?? 0n;
      current.customerTotalPaidCents += record.customerTotalPaidCents ?? 0n;
      current.totalLargeFeeWageCents += record.totalLargeFeeWageCents;
      current.employeeIncomeCents +=
        record.totalLargeFeeWageCents + (record.totalTipCents ?? 0n);
      if (record.status === "CONFIRMED") {
        current.cashRecords.push({
          cashServiceCents: record.cashServiceCents ?? 0n,
          cashTipCents: record.cashTipCents ?? 0n,
          cashAllocatedServiceWageCents:
            record.cashAllocatedServiceWageCents ?? 0n,
          cashAcquiredServiceWageCents:
            record.cashAcquiredServiceWageCents ?? 0n,
          cashWageShortfallCents: record.cashWageShortfallCents ?? 0n,
        });
      }
      if (record.status === "PENDING_PAYMENT") current.incompleteRecordCount += 1;
      employeeMap.set(record.employeeMembershipId, current);
    }
    const employees = [...employeeMap.values()].map(
      ({ cashRecords, ...item }) =>
        this.safeTotals({
          ...item,
          cashToSubmitToStoreCents:
            calculateDailyCashSettlement(cashRecords)
              .cashToSubmitToStoreCents,
        }),
    );
    const storeTotals = employees.reduce(
      (total, item) => ({
        recordCount: total.recordCount + item.recordCount,
        grossFeeBaseCents: total.grossFeeBaseCents + item.grossFeeBaseCents,
        discountTotalCents: total.discountTotalCents + item.discountTotalCents,
        discountedFeePerformanceCents:
          total.discountedFeePerformanceCents + item.discountedFeePerformanceCents,
        totalTipCents: total.totalTipCents + item.totalTipCents,
        customerTotalPaidCents:
          total.customerTotalPaidCents + item.customerTotalPaidCents,
        totalLargeFeeWageCents:
          total.totalLargeFeeWageCents + item.totalLargeFeeWageCents,
        employeeIncomeCents:
          total.employeeIncomeCents + item.employeeIncomeCents,
        incompleteRecordCount:
          total.incompleteRecordCount + item.incompleteRecordCount,
      }),
      {
        recordCount: 0,
        grossFeeBaseCents: 0,
        discountTotalCents: 0,
        discountedFeePerformanceCents: 0,
        totalTipCents: 0,
        customerTotalPaidCents: 0,
        totalLargeFeeWageCents: 0,
        employeeIncomeCents: 0,
        incompleteRecordCount: 0,
      },
    );
    return {
      storeId,
      businessDate,
      isClosed: Boolean(activeClosing),
      activeClosing,
      hasWarnings: warnings.length > 0,
      warningCount: warnings.reduce((count, warning) => count + warning.count, 0),
      warnings,
      employees,
      storeTotals,
    };
  }

  private safeTotals<T extends Record<string, unknown>>(value: T) {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        typeof entry === "bigint" ? this.safeNumber(entry) : entry,
      ]),
    ) as {
      [K in keyof T]: T[K] extends bigint ? number : T[K];
    };
  }

  private safeNumber(value: bigint): number {
    if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
      throw new BadRequestException({
        code: "AMOUNT_TOTAL_TOO_LARGE",
        messageZh: "金额合计超出系统允许范围",
      });
    }
    return Number(value);
  }
}
