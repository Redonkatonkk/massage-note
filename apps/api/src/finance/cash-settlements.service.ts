import { businessDateFor, deviceNow } from "../common/device-time.js";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type User } from "@massage-note/database";
import type {
  ReopenCashInput,
  SettleAllCashInput,
  SettleCashInput,
} from "@massage-note/contracts";
import {
  calculateDailyCashSettlement,
  calculateDailyFullSettlement,
  hasStoreCapability,
} from "@massage-note/domain";
import { lockBusinessDay } from "../common/business-day-lock.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";

const dateAtUtc = (date: string) => new Date(`${date}T00:00:00.000Z`);
type FinanceClient = Prisma.TransactionClient | PrismaService;

interface CalculatedCashRow {
  membershipId: string;
  displayName: string;
  role: string;
  cashServiceCents: bigint;
  cashTipCents: bigint;
  cashReceivedCents: bigint;
  cashAllocatedServiceWageCents: bigint;
  cashAcquiredServiceWageCents: bigint;
  cashWageShortfallCents: bigint;
  cashRetainedCents: bigint;
  cashToSubmitToStoreCents: bigint;
  dailySettlementEnabled: boolean;
  additionalServiceWagePaidCents: bigint;
  nonCashTipPaidCents: bigint;
  dailySettlementPayoutCents: bigint;
  incompleteRecordCount: number;
  status: "UNSETTLED" | "SETTLED";
  note: string;
  settledBy: string | null;
  settledByDisplayName: string | null;
  settledAt: Date | null;
  version: number;
  settlementId: string | null;
}

@Injectable()
export class CashSettlementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoreAccessService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async list(actor: User, storeId: string, businessDate: string) {
    const membership = await this.access.requireActiveMembership(actor.id, storeId);
    const mayReadAll = hasStoreCapability(
      membership.role,
      "CASH_SETTLEMENT_MANAGE",
    );
    const rows = await this.calculateRows(this.prisma, storeId, businessDate);
    return {
      storeId,
      businessDate,
      rows: mayReadAll
        ? rows
        : rows.filter((row) => row.membershipId === membership.id),
    };
  }

  async settle(
    actor: User,
    storeId: string,
    businessDate: string,
    membershipId: string,
    input: SettleCashInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const manager = await this.access.requireCapability(
      actor.id,
      storeId,
      "CASH_SETTLEMENT_MANAGE",
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route:
          "/api/v1/stores/:storeId/cash-settlements/:date/:membershipId/settle",
        payload: { businessDate, membershipId, input },
        responseCode: 200,
      },
      async (transaction) => {
        await lockBusinessDay(transaction, storeId, businessDate);
        const rows = await this.calculateRows(transaction, storeId, businessDate);
        const row = rows.find((item) => item.membershipId === membershipId);
        if (!row) this.throwCashRowNotFound();
        if (input.dailySettlementEnabled !== undefined && input.dailySettlementEnabled !== row.dailySettlementEnabled) {
          throw new ConflictException({ code: "CASH_SETTLEMENT_MODE_CHANGED", messageZh: "成员每日结清设置已变化，请重新打开个人日结核对" });
        }
        return this.settleRow(
          transaction,
          actor,
          manager.id,
          storeId,
          businessDate,
          row,
          input.version,
          input.note,
          requestId,
          "cash_settlement.settled",
        );
      },
    );
  }

  async settleAll(
    actor: User,
    storeId: string,
    businessDate: string,
    input: SettleAllCashInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const manager = await this.access.requireCapability(
      actor.id,
      storeId,
      "CASH_SETTLEMENT_MANAGE",
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "/api/v1/stores/:storeId/cash-settlements/:date/settle-all",
        payload: { businessDate, input },
        responseCode: 200,
      },
      async (transaction) => {
        await lockBusinessDay(transaction, storeId, businessDate);
        const rows = await this.calculateRows(transaction, storeId, businessDate);
        const requested = new Map(
          input.settlements.map((item) => [item.membershipId, item]),
        );
        if (
          requested.size !== input.settlements.length ||
          requested.size !== rows.length ||
          rows.some((row) => !requested.has(row.membershipId))
        ) {
          throw new BadRequestException({
            code: "CASH_SETTLEMENT_ROWS_MISMATCH",
            messageZh: "一键结清必须包含当前页面的全部员工及最新版本",
          });
        }
        const settlements = [];
        for (const row of rows) {
          const expected = requested.get(row.membershipId);
          if (!expected) continue;
          if (expected.version !== row.version || (expected.dailySettlementEnabled !== undefined && expected.dailySettlementEnabled !== row.dailySettlementEnabled)) {
            throw new ConflictException({
              code: "CASH_SETTLEMENT_VERSION_CONFLICT",
              messageZh: "现金结算金额或状态已发生变化，请刷新后重试",
              latestResource: row,
            });
          }
          if (row.status === "SETTLED") {
            if (!row.settlementId) this.throwCashRowNotFound();
            settlements.push(
              await transaction.dailyCashSettlement.findUniqueOrThrow({
                where: { id: row.settlementId },
              }),
            );
            continue;
          }
          settlements.push(
            await this.settleRow(
              transaction,
              actor,
              manager.id,
              storeId,
              businessDate,
              row,
              expected.version,
              expected.note,
              requestId,
              "cash_settlement.settled_via_all",
            ),
          );
        }
        return { storeId, businessDate, settlements };
      },
    );
  }

  async reopen(
    actor: User,
    storeId: string,
    businessDate: string,
    membershipId: string,
    input: ReopenCashInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const manager = await this.access.requireCapability(
      actor.id,
      storeId,
      "CASH_SETTLEMENT_MANAGE",
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route:
          "/api/v1/stores/:storeId/cash-settlements/:date/:membershipId/reopen",
        payload: { businessDate, membershipId, input },
        responseCode: 200,
      },
      async (transaction) => {
        await lockBusinessDay(transaction, storeId, businessDate);
        const current = await transaction.dailyCashSettlement.findFirst({
          where: {
            storeId,
            businessDate: dateAtUtc(businessDate),
            membershipId,
            deletedAt: null,
          },
        });
        if (!current) this.throwCashRowNotFound();
        const changed = await transaction.dailyCashSettlement.updateMany({
          where: {
            id: current.id,
            status: "SETTLED",
            version: input.version,
            deletedAt: null,
          },
          data: {
            status: "UNSETTLED",
            settledBy: null,
            settledAt: null,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          const latest = await transaction.dailyCashSettlement.findUnique({
            where: { id: current.id },
          });
          throw new ConflictException({
            code: "CASH_SETTLEMENT_VERSION_CONFLICT",
            messageZh: "现金结算状态已发生变化，请刷新后重试",
            latestResource: latest,
          });
        }
        const reopened = await transaction.dailyCashSettlement.findUniqueOrThrow({
          where: { id: current.id },
        });
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: manager.id,
            source: "api",
            action: "cash_settlement.reopened",
            entityType: "daily_cash_settlement",
            entityId: current.id,
            businessDate: current.businessDate,
            beforeJson: { status: current.status, version: current.version },
            afterJson: { status: reopened.status, version: reopened.version },
            reason: input.reason ?? null,
            requestId,
          },
        });
        return reopened;
      },
    );
  }

  private async settleRow(
    transaction: Prisma.TransactionClient,
    actor: User,
    actorMembershipId: string,
    storeId: string,
    businessDate: string,
    row: CalculatedCashRow,
    expectedVersion: number,
    note: string | undefined,
    requestId: string,
    action: string,
  ) {
    const current = await transaction.dailyCashSettlement.findUnique({
      where: {
        storeId_businessDate_membershipId: {
          storeId,
          businessDate: dateAtUtc(businessDate),
          membershipId: row.membershipId,
        },
      },
    });
    if ((current?.version ?? 0) !== expectedVersion) {
      throw new ConflictException({
        code: "CASH_SETTLEMENT_VERSION_CONFLICT",
        messageZh: "现金结算金额或状态已发生变化，请刷新后重试",
        latestResource: current ?? row,
      });
    }
    if (current?.status === "SETTLED" && current.deletedAt === null) return current;
    if (row.dailySettlementEnabled) {
      if (row.incompleteRecordCount > 0) {
        throw new ConflictException({ code: "DAILY_SETTLEMENT_PENDING_PAYMENT", messageZh: "当天还有未确认付款的记工，请结账后再结清全部工资" });
      }
      const alreadyPaid = await transaction.payrollSettlement.findFirst({
        where: { storeId, membershipId: row.membershipId, deletedAt: null,
          periodStart: { lte: dateAtUtc(businessDate) }, periodEnd: { gte: dateAtUtc(businessDate) },
          confirmation: { isNot: null } },
        select: { id: true },
      });
      if (alreadyPaid) {
        throw new ConflictException({ code: "DAILY_SETTLEMENT_PAYROLL_CONFLICT", messageZh: "当天已有工资结清记录，请在工资结算页核对，避免重复发放" });
      }
    }
    const settledAt = new Date();
    const amounts = {
      dailySettlementEnabled: row.dailySettlementEnabled,
      additionalServiceWagePaidCents: row.additionalServiceWagePaidCents,
      nonCashTipPaidCents: row.nonCashTipPaidCents,
      cashServiceCents: row.cashServiceCents,
      cashTipCents: row.cashTipCents,
      cashReceivedCents: row.cashReceivedCents,
      cashAllocatedServiceWageCents: row.cashAllocatedServiceWageCents,
      cashAcquiredServiceWageCents: row.cashAcquiredServiceWageCents,
      cashWageShortfallCents: row.cashWageShortfallCents,
      cashRetainedCents: row.cashRetainedCents,
      cashToSubmitToStoreCents: row.cashToSubmitToStoreCents,
    };
    let settlement;
    if (current) {
      const changed = await transaction.dailyCashSettlement.updateMany({
        where: { id: current.id, version: expectedVersion },
        data: {
          ...amounts,
          status: "SETTLED",
          note: note ?? current.note,
          settledBy: actor.id,
          settledAt,
          deletedAt: null,
          deletedBy: null,
          deleteReason: null,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        const latest = await transaction.dailyCashSettlement.findUnique({
          where: { id: current.id },
        });
        throw new ConflictException({
          code: "CASH_SETTLEMENT_VERSION_CONFLICT",
          messageZh: "现金结算金额或状态已发生变化，请刷新后重试",
          latestResource: latest,
        });
      }
      settlement = await transaction.dailyCashSettlement.findUniqueOrThrow({
        where: { id: current.id },
      });
    } else {
      settlement = await transaction.dailyCashSettlement.create({
          data: {
            storeId,
            businessDate: dateAtUtc(businessDate),
            membershipId: row.membershipId,
            ...amounts,
            status: "SETTLED",
            note: note ?? "",
            settledBy: actor.id,
            settledAt,
          },
        });
    }
    await transaction.auditLog.create({
      data: {
        storeId,
        actorUserId: actor.id,
        actorMembershipId,
        source: "api",
        action,
        entityType: "daily_cash_settlement",
        entityId: settlement.id,
        businessDate: settlement.businessDate,
        beforeJson: current
          ? { status: current.status, version: current.version }
          : Prisma.JsonNull,
        afterJson: {
          status: settlement.status,
          dailySettlementEnabled: settlement.dailySettlementEnabled,
          dailySettlementPayoutCents: row.dailySettlementPayoutCents.toString(),
          cashReceivedCents: settlement.cashReceivedCents.toString(),
          cashRetainedCents: settlement.cashRetainedCents.toString(),
          cashToSubmitToStoreCents:
            settlement.cashToSubmitToStoreCents.toString(),
          version: settlement.version,
        },
        requestId,
      },
    });
    return settlement;
  }

  private async calculateRows(
    client: FinanceClient,
    storeId: string,
    businessDate: string,
  ): Promise<CalculatedCashRow[]> {
    const store = await client.store.findFirst({
      where: { id: storeId, status: "ACTIVE", deletedAt: null },
      select: { timezone: true, businessCutoffLocal: true },
    });
    if (!store) {
      throw new NotFoundException({
        code: "STORE_NOT_FOUND",
        messageZh: "店铺不存在或已停用",
      });
    }
    const currentDate = businessDateFor({
      startAt: deviceNow(),
      timezone: store.timezone,
      cutoffLocal: store.businessCutoffLocal,
    });
    if (businessDate > currentDate) {
      throw new BadRequestException({
        code: "FUTURE_BUSINESS_DAY",
        messageZh: "不能结算未来营业日的现金",
      });
    }
    // Serialize mode changes with settlement snapshots, including settle-all.
    await client.$queryRaw`SELECT id FROM store_memberships WHERE store_id = ${storeId}::uuid ORDER BY id FOR SHARE`;
    const [records, existing, allStoreMemberships] = await Promise.all([
      client.workRecord.findMany({
        where: {
          storeId,
          businessDate: dateAtUtc(businessDate),
          deletedAt: null,
        },
        orderBy: { startAt: "asc" },
        select: {
          employeeMembershipId: true,
          status: true,
          totalLargeFeeWageCents: true,
          cardTipCents: true,
          giftCardTipCents: true,
          cashServiceCents: true,
          cashTipCents: true,
          cashAllocatedServiceWageCents: true,
          cashAcquiredServiceWageCents: true,
          cashWageShortfallCents: true,
          employee: { select: { displayName: true, role: true, dailySettlementEnabled: true } },
        },
      }),
      client.dailyCashSettlement.findMany({
        where: {
          storeId,
          businessDate: dateAtUtc(businessDate),
          deletedAt: null,
        },
      }),
      client.storeMembership.findMany({
        where: { storeId },
        select: { userId: true, displayName: true },
        orderBy: { joinedAt: "desc" },
      }),
    ]);
    const settledByName = new Map<string, string>();
    for (const item of allStoreMemberships) {
      if (item.userId && !settledByName.has(item.userId)) {
        settledByName.set(item.userId, item.displayName);
      }
    }
    const identities = new Map<
      string,
      { id: string; displayName: string; role: string; dailySettlementEnabled: boolean }
    >();
    for (const record of records) {
      if (!identities.has(record.employeeMembershipId)) {
        identities.set(record.employeeMembershipId, {
          id: record.employeeMembershipId,
          displayName: record.employee.displayName,
          role: record.employee.role,
          dailySettlementEnabled: record.employee.dailySettlementEnabled,
        });
      }
    }
    const storedByMembership = new Map(
      existing.map((settlement) => [settlement.membershipId, settlement]),
    );
    return [...identities.values()].map((membership) => {
      const memberRecords = records
        .filter(
          (record) =>
            record.employeeMembershipId === membership.id &&
            record.status === "CONFIRMED",
        )
        .map((record) => ({
          totalLargeFeeWageCents: record.totalLargeFeeWageCents,
          cardTipCents: record.cardTipCents ?? 0n,
          giftCardTipCents: record.giftCardTipCents ?? 0n,
          cashServiceCents: record.cashServiceCents ?? 0n,
          cashTipCents: record.cashTipCents ?? 0n,
          cashAllocatedServiceWageCents:
            record.cashAllocatedServiceWageCents ?? 0n,
          cashAcquiredServiceWageCents:
            record.cashAcquiredServiceWageCents ?? 0n,
          cashWageShortfallCents: record.cashWageShortfallCents ?? 0n,
        }));
      const calculated = calculateDailyCashSettlement(memberRecords);
      const stored = storedByMembership.get(membership.id);
      const amounts = stored?.status === "SETTLED" ? stored : calculated;
      const dailySettlementEnabled = stored?.status === "SETTLED" ? stored.dailySettlementEnabled : membership.dailySettlementEnabled;
      const daily = calculateDailyFullSettlement(memberRecords);
      const additionalServiceWagePaidCents = stored?.status === "SETTLED" ? stored.additionalServiceWagePaidCents : dailySettlementEnabled ? daily.additionalServiceWagePaidCents : 0n;
      const nonCashTipPaidCents = stored?.status === "SETTLED" ? stored.nonCashTipPaidCents : dailySettlementEnabled ? daily.nonCashTipPaidCents : 0n;
      return {
        dailySettlementEnabled,
        additionalServiceWagePaidCents,
        nonCashTipPaidCents,
        dailySettlementPayoutCents: amounts.cashAcquiredServiceWageCents + additionalServiceWagePaidCents + nonCashTipPaidCents,
        incompleteRecordCount: records.filter((record) => record.employeeMembershipId === membership.id && record.status !== "CONFIRMED").length,
        membershipId: membership.id,
        displayName: membership.displayName,
        role: membership.role,
        cashServiceCents: amounts.cashServiceCents,
        cashTipCents: amounts.cashTipCents,
        cashReceivedCents: amounts.cashReceivedCents,
        cashAllocatedServiceWageCents:
          amounts.cashAllocatedServiceWageCents,
        cashAcquiredServiceWageCents:
          amounts.cashAcquiredServiceWageCents,
        cashWageShortfallCents: amounts.cashWageShortfallCents,
        cashRetainedCents: amounts.cashRetainedCents,
        cashToSubmitToStoreCents: amounts.cashToSubmitToStoreCents,
        status: stored?.status ?? "UNSETTLED",
        note: stored?.note ?? "",
        settledBy: stored?.settledBy ?? null,
        settledByDisplayName: stored?.settledBy ? settledByName.get(stored.settledBy) ?? "原店铺成员" : null,
        settledAt: stored?.settledAt ?? null,
        version: stored?.version ?? 0,
        settlementId: stored?.id ?? null,
      };
    });
  }

  private throwCashRowNotFound(): never {
    throw new NotFoundException({
      code: "CASH_SETTLEMENT_ROW_NOT_FOUND",
      messageZh: "没有找到该员工在这个营业日的现金结算",
    });
  }
}
