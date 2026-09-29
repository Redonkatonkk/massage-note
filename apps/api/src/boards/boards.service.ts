import { isDeepStrictEqual } from "node:util";
import { businessDateFor, deviceNow, deviceTimezone } from "../common/device-time.js";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type User } from "@massage-note/database";
import { rankingExplanationSchema } from "@massage-note/contracts";
import type {
  AddBoardRowInput,
  CalendarDateRangeQuery,
  ClockOutInput,
  RemoveBoardRowInput,
  ReorderBoardInput,
  UpdateBoardRowInput,
} from "@massage-note/contracts";
import {
  calculateAverageRevenue,
  calculateRevenue,
  calculateStoreIncome,
  calculateBoardTotalIncome,
  hasStoreCapability,
} from "@massage-note/domain";
import { explainRotationCandidates } from "@massage-note/domain";
import type { UpdateWeeklyDispatchInput } from "@massage-note/contracts";
import { ensureBoardRow } from "../common/ensure-board-row.js";
import { lockBusinessDay } from "../common/business-day-lock.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";

const dateAtUtc = (date: string) => new Date(`${date}T00:00:00.000Z`);
const weeklyDays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
const emptyWeeklyDispatch = (): Record<(typeof weeklyDays)[number], string[]> => ({ monday: [], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] });
function weeklyDispatchFromJson(value: Prisma.JsonValue | null): Record<(typeof weeklyDays)[number], string[]> {
  const empty = emptyWeeklyDispatch();
  if (!value || typeof value !== "object" || Array.isArray(value)) return empty;
  for (const day of weeklyDays) {
    const members = (value as Record<string, unknown>)[day];
    if (Array.isArray(members)) empty[day] = members.filter((item): item is string => typeof item === "string");
  }
  return empty;
}

interface BoardStatistics {
  recordCount: number;
  grossFeeBaseCents: bigint;
  discountTotalCents: bigint;
  discountedFeePerformanceCents: bigint;
  totalTipCents: bigint;
  totalLargeFeeWageCents: bigint;
  employeeIncomeCents: bigint;
  giftCardSaleCount: number;
  giftCardCashCents: bigint;
  giftCardCardCents: bigint;
  giftCardSalesAmountCents: bigint;
  giftCardRedemptionCents: bigint;
  storeIncomeCents: bigint;
}

@Injectable()
export class BoardsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoreAccessService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async getWeeklyDispatch(actor: User, storeId: string) {
    await this.access.requireCapability(actor.id, storeId, "MEMBERSHIP_MANAGE");
    const store = await this.findStore(this.prisma, storeId);
    return { version: store.version, effectiveFrom: store.weeklyDispatchEffectiveFrom?.toISOString().slice(0, 10) ?? null,
      schedule: weeklyDispatchFromJson(store.weeklyDispatchJson) };
  }

  async saveWeeklyDispatch(actor: User, storeId: string, input: UpdateWeeklyDispatchInput, idempotencyKey: string, requestId: string) {
    const manager = await this.access.requireCapability(actor.id, storeId, "MEMBERSHIP_MANAGE");
    return this.idempotency.execute({ storeId, userId: actor.id, key: idempotencyKey, route: "/api/v1/stores/:storeId/weekly-dispatch", payload: input, responseCode: 200 }, async (transaction) => {
      const store = await this.findStore(transaction, storeId);
      if (store.version !== input.version) throw new ConflictException({ code: "STORE_VERSION_CONFLICT", messageZh: "店铺设置已经变化，请刷新后重试" });
      const ids = [...new Set(Object.values(input.schedule).flat())];
      const members = await transaction.storeMembership.findMany({
        where: { storeId, id: { in: ids }, status: "ACTIVE", deletedAt: null, isServiceProvider: true },
        select: { id: true, displayName: true, employmentType: true },
      });
      if (members.length !== ids.length) throw new BadRequestException({ code: "WEEKLY_DISPATCH_MEMBER_INVALID", messageZh: "排工表中包含已停用或不可参与记工的员工，请刷新后重试" });
      if (store.automaticDispatchEnabled) {
        const missing = members.filter((member) => !member.employmentType);
        if (missing.length) throw new ConflictException({ code: "DAILY_RANKING_EMPLOYMENT_TYPE_REQUIRED", messageZh: `请先设置全职或兼职：${missing.map((member) => member.displayName).join("、")}` });
      }
      const today = businessDateFor({ startAt: deviceNow(), timezone: deviceTimezone(store.timezone), cutoffLocal: store.businessCutoffLocal });
      const effectiveFrom = today;
      const schedule = Object.fromEntries(weeklyDays.map((day) => [day, [...new Set(input.schedule[day])]]));
      const changed = await transaction.store.updateMany({ where: { id: storeId, version: input.version, status: "ACTIVE", deletedAt: null }, data: {
        weeklyDispatchJson: schedule,
        weeklyDispatchEffectiveFrom: dateAtUtc(effectiveFrom),
        version: { increment: 1 },
      } });
      if (changed.count !== 1) throw new ConflictException({ code: "STORE_VERSION_CONFLICT", messageZh: "店铺设置已经变化，请刷新后重试" });
      const updated = await transaction.store.findUniqueOrThrow({ where: { id: storeId } });
      await transaction.auditLog.create({ data: {
        storeId, actorUserId: actor.id, actorMembershipId: manager.id, source: "api",
        action: "board.weekly_dispatch_updated", entityType: "store", entityId: storeId,
        beforeJson: { schedule: store.weeklyDispatchJson ?? emptyWeeklyDispatch(), effectiveFrom: store.weeklyDispatchEffectiveFrom?.toISOString().slice(0, 10) ?? null },
        afterJson: { schedule, effectiveFrom, version: updated.version }, requestId,
      } });
      await transaction.domainOutbox.create({ data: { storeId, topic: "board.weekly_dispatch_updated", aggregateType: "store", aggregateId: storeId, payloadJson: { version: updated.version, effectiveFrom } } });
      return { effectiveFrom, schedule };
    });
  }

  async replaceWeeklyDispatch(actor: User, storeId: string, businessDate: string, input: UpdateWeeklyDispatchInput, idempotencyKey: string, requestId: string) {
    await this.access.requireCapability(actor.id, storeId, "MEMBERSHIP_MANAGE");
    return this.applyWeeklyDispatch(actor, storeId, businessDate, requestId, { input, idempotencyKey });
  }

  async applyWeeklyDispatch(actor: User, storeId: string, businessDate: string, requestId: string, replacement?: { input: UpdateWeeklyDispatchInput; idempotencyKey: string }) {
    const membership = await this.access.requireActiveMembership(actor.id, storeId);
    const store = await this.findStore(this.prisma, storeId);
    const currentDate = businessDateFor({ startAt: deviceNow(), timezone: deviceTimezone(store.timezone), cutoffLocal: store.businessCutoffLocal });
    if (businessDate < currentDate) {
      if (replacement) throw new ForbiddenException({ code: "WEEKLY_DISPATCH_PAST_REPLACE_FORBIDDEN", messageZh: "应用失败：不能覆盖过去日期的排工" });
      return { applied: false };
    }
    if (membership.role === "EMPLOYEE" && businessDate > currentDate) throw new ForbiddenException({ code: "WEEKLY_DISPATCH_FUTURE_APPLY_FORBIDDEN", messageZh: "员工不能初始化未来营业日" });
    const weekday = weeklyDays[(dateAtUtc(businessDate).getUTCDay() + 6) % 7]!;
    const apply = async (transaction: Prisma.TransactionClient) => {
      await lockBusinessDay(transaction, storeId, businessDate);
      const currentStore = await this.findStore(transaction, storeId);
      const effectiveFrom = currentStore.weeklyDispatchEffectiveFrom?.toISOString().slice(0, 10);
      if (replacement) {
        if (currentStore.version !== replacement.input.version) throw new ConflictException({ code: "STORE_VERSION_CONFLICT", messageZh: "店铺设置已经变化，请取消后重新打开并核对" });
        if (await transaction.workRecord.count({ where: { storeId, businessDate: dateAtUtc(businessDate) } })) {
          throw new ConflictException({ code: "WEEKLY_DISPATCH_HAS_WORK_RECORDS", messageZh: "应用失败：该日期已有记工，不能覆盖排工" });
        }
      }
      if (!replacement && (!effectiveFrom || businessDate < effectiveFrom)) return { applied: false };
      const closings = await transaction.businessDayClosing.findFirst({ where: { storeId, businessDate: dateAtUtc(businessDate), status: "CLOSED" }, select: { id: true } });
      if (closings) {
        if (replacement) throw new ConflictException({ code: "BUSINESS_DAY_CLOSED", messageZh: "应用失败：该日期已经日结，请先取消日结" });
        return { applied: false };
      }
      // Daily manual removals override the recurring template. A later manual
      // addition clears the override; template applications never do.
      const manualChanges = await transaction.auditLog.findMany({
        where: { storeId, businessDate: dateAtUtc(businessDate),
          action: { in: ["board.row_removed", "board.row_added"] } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        select: { action: true, beforeJson: true, afterJson: true },
      });
      const seenMembershipIds = new Set<string>();
      const excludedMembershipIds = new Set<string>();
      for (const change of manualChanges) {
        const snapshot = (change.action === "board.row_removed" ? change.beforeJson : change.afterJson) as { membershipId?: string } | null;
        const membershipId = snapshot?.membershipId;
        if (!membershipId || seenMembershipIds.has(membershipId)) continue;
        seenMembershipIds.add(membershipId);
        if (change.action === "board.row_removed") excludedMembershipIds.add(membershipId);
      }
      const ids = replacement ? [...new Set(replacement.input.schedule[weekday])]
        : weeklyDispatchFromJson(currentStore.weeklyDispatchJson)[weekday].filter((id) => !excludedMembershipIds.has(id));
      const board = await transaction.dailyBoard.upsert({
        where: { storeId_businessDate: { storeId, businessDate: dateAtUtc(businessDate) } },
        create: { storeId, businessDate: dateAtUtc(businessDate) }, update: {},
      });
      await transaction.$queryRaw`SELECT id FROM daily_boards WHERE id = ${board.id}::uuid FOR UPDATE`;
      const fresh = await transaction.dailyBoard.findUniqueOrThrow({ where: { id: board.id }, include: { rows: true } });
      const isFuture = businessDate > currentDate;
      if (fresh.weeklyDispatchAppliedAt && !isFuture && !replacement) return { applied: false };
      // Remember which rows were introduced by the template; manual additions remain independent.
      const previousApplication = !replacement && isFuture && fresh.weeklyDispatchAppliedAt
        ? await transaction.auditLog.findFirst({
          where: { storeId, entityId: board.id, action: "board.weekly_dispatch_applied" },
          orderBy: { createdAt: "desc" }, select: { afterJson: true },
        }) : null;
      const previousData = previousApplication?.afterJson as { overwritten?: boolean; managedMembershipIds?: string[]; addedMembershipIds?: string[] } | null;
      if (previousData?.overwritten) return { applied: false };
      const previousManaged = previousData?.managedMembershipIds ?? previousData?.addedMembershipIds ?? [];
      const selected = await transaction.storeMembership.findMany({
        where: { id: { in: ids }, storeId, status: "ACTIVE", deletedAt: null, isServiceProvider: true },
        select: { id: true, displayName: true, employmentType: true },
      });
      const selectedIds = new Set(selected.map((item) => item.id));
      const removedMembershipIds: string[] = [];
      if (replacement) {
        if (selected.length !== ids.length) throw new BadRequestException({ code: "WEEKLY_DISPATCH_MEMBER_INVALID", messageZh: "排工表中包含已停用或不可参与记工的员工，请重新打开后重试" });
        if (currentStore.automaticDispatchEnabled && selected.some(member => !member.employmentType)) throw new ConflictException({ code: "DAILY_RANKING_EMPLOYMENT_TYPE_REQUIRED", messageZh: "请先为排工员工设置全职或兼职" });
        removedMembershipIds.push(...fresh.rows.map(row => row.membershipId));
        await transaction.dailyEmployeeRow.deleteMany({ where: { boardId: board.id } });
        fresh.rows = [];
      }
      for (const row of fresh.rows) {
        if (!previousManaged.includes(row.membershipId) || selectedIds.has(row.membershipId)
          || (seenMembershipIds.has(row.membershipId) && !excludedMembershipIds.has(row.membershipId))) continue;
        const [records, shifts] = await Promise.all([
          transaction.workRecord.count({ where: { storeId, businessDate: dateAtUtc(businessDate), employeeMembershipId: row.membershipId } }),
          transaction.shift.count({ where: { storeId, businessDate: dateAtUtc(businessDate), membershipId: row.membershipId } }),
        ]);
        if (records || shifts) continue;
        await transaction.dailyEmployeeRow.delete({ where: { id: row.id } });
        removedMembershipIds.push(row.membershipId);
      }
      const preserveCurrentRows = !replacement && !isFuture && fresh.rows.length > 0;
      const missingIds = (preserveCurrentRows ? [] : ids).filter((id) => selectedIds.has(id) && !fresh.rows.some((row) => row.membershipId === id));
      const managedMembershipIds = [...new Set([...previousManaged.filter((id) => selectedIds.has(id) && !seenMembershipIds.has(id)), ...missingIds])];
      if (missingIds.length) {
        const max = await transaction.dailyEmployeeRow.aggregate({ where: { boardId: board.id }, _max: { position: true } });
        let position = max._max.position ?? new Prisma.Decimal(0);
        for (const membershipId of missingIds) {
          position = position.plus(1);
          await transaction.dailyEmployeeRow.create({ data: { boardId: board.id, storeId, membershipId, position, addedBy: actor.id } });
        }
      }
      const rows = await transaction.dailyEmployeeRow.findMany({ where: { boardId: board.id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], include: { membership: { select: { displayName: true, employmentType: true } } } });
      const visible = rows.filter((row) => !row.isHidden);
      let explanation: Prisma.InputJsonValue | undefined;
      let rankedAt: Date | undefined;
      if (!preserveCurrentRows && currentStore.automaticDispatchEnabled && visible.length && visible.every((row) => row.membership.employmentType)) {
        const candidates = await Promise.all(visible.map(async (row) => {
          const previous = await transaction.dailyEmployeeRow.findFirst({ where: { membershipId: row.membershipId, storeId, isHidden: false, board: { businessDate: { lt: dateAtUtc(businessDate) } } }, orderBy: { board: { businessDate: "desc" } }, select: { board: { select: { businessDate: true, rows: { where: { isHidden: false }, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { membershipId: true } } } } } });
          const lastPosition = previous ? previous.board.rows.findIndex((item) => item.membershipId === row.membershipId) + 1 : null;
          return { membershipId: row.membershipId, employmentType: row.membership.employmentType!, lastPosition, lastBusinessDate: previous?.board.businessDate.toISOString().slice(0, 10) ?? null };
        }));
        const explained = explainRotationCandidates(candidates);
        const order = explained.map((entry) => entry.membershipId);
        const hidden = rows.filter((row) => row.isHidden).map((row) => row.membershipId);
        const completeOrder = [...order, ...hidden];
        const entries = explained.map((entry) => ({ ...entry, displayName: visible.find((row) => row.membershipId === entry.membershipId)!.membership.displayName }));
        const previousExplanation = rankingExplanationSchema.safeParse(fresh.rankingExplanation).data;
        if (replacement || completeOrder.some((id, index) => id !== rows[index]?.membershipId)
          || !isDeepStrictEqual(previousExplanation?.entries, entries)) {
          for (const [index, id] of completeOrder.entries()) {
            const row = rows.find((item) => item.membershipId === id)!;
            await transaction.dailyEmployeeRow.update({ where: { id: row.id }, data: { position: new Prisma.Decimal(index + 1), version: { increment: 1 } } });
          }
          rankedAt = new Date();
          explanation = { schemaVersion: 1, generatedAt: rankedAt.toISOString(), entries };
        }
      }
      if (!replacement && fresh.weeklyDispatchAppliedAt && !missingIds.length && !removedMembershipIds.length && !rankedAt
        && JSON.stringify(previousManaged) === JSON.stringify(managedMembershipIds)) return { applied: false };
      const updateData: Prisma.DailyBoardUpdateInput = {
        weeklyDispatchAppliedAt: new Date(), version: { increment: 1 },
      };
      if (replacement) { updateData.rankedAt = null; updateData.rankingExplanation = Prisma.DbNull; }
      if (rankedAt && explanation) { updateData.rankedAt = rankedAt; updateData.rankingExplanation = explanation; }
      const updated = await transaction.dailyBoard.update({ where: { id: board.id }, data: updateData });
      await transaction.auditLog.create({ data: {
        storeId, actorUserId: actor.id, actorMembershipId: membership.id, source: "api",
        action: "board.weekly_dispatch_applied", entityType: "daily_board", entityId: board.id,
        businessDate: dateAtUtc(businessDate), ...(replacement ? { beforeJson: { membershipIds: removedMembershipIds } } : {}),
        afterJson: { overwritten: !!replacement, addedMembershipIds: missingIds, removedMembershipIds, managedMembershipIds, rankedAt: rankedAt?.toISOString() ?? null, version: updated.version }, requestId,
      } });
      await transaction.domainOutbox.create({ data: { storeId, topic: "board.weekly_dispatch_applied", aggregateType: "daily_board", aggregateId: board.id, payloadJson: { businessDate, addedMembershipIds: missingIds, removedMembershipIds, version: updated.version } } });
      return { applied: true, addedCount: missingIds.length, ranked: !!rankedAt };
    };
    return replacement
      ? this.idempotency.execute({ storeId, userId: actor.id, key: replacement.idempotencyKey, route: "/api/v1/stores/:storeId/boards/:businessDate/replace-weekly-dispatch", payload: { ...replacement.input, businessDate }, responseCode: 200 }, apply)
      : this.prisma.$transaction(apply);
  }

  async currentBusinessDay(actor: User, storeId: string) {
    await this.access.requireActiveMembership(actor.id, storeId);
    const store = await this.findStore(this.prisma, storeId);
    const businessDate = businessDateFor({
      startAt: deviceNow(),
      timezone: deviceTimezone(store.timezone),
      cutoffLocal: store.businessCutoffLocal,
    });
    return {
      businessDate,
      timezone: deviceTimezone(store.timezone),
      businessCutoffLocal: store.businessCutoffLocal,
      serverTime: new Date(),
    };
  }

  async openWorkDates(
    actor: User,
    storeId: string,
    query: CalendarDateRangeQuery,
  ) {
    const actorMembership = await this.access.requireActiveMembership(
      actor.id,
      storeId,
    );
    const canReadStore = hasStoreCapability(
      actorMembership.role,
      "FINANCE_READ_STORE",
    );
    const dateRange = {
      gte: dateAtUtc(query.dateFrom),
      lte: dateAtUtc(query.dateTo),
    };
    const [workDates, closedDates, giftCardDates] = await Promise.all([
      this.prisma.workRecord.groupBy({
        where: {
          storeId,
          businessDate: dateRange,
          deletedAt: null,
          ...(canReadStore
            ? {}
            : { employeeMembershipId: actorMembership.id }),
        },
        by: ["businessDate"],
        _sum: { discountedFeePerformanceCents: true },
      }),
      this.prisma.businessDayClosing.findMany({
        where: { storeId, businessDate: dateRange, status: "CLOSED" },
        select: { businessDate: true },
        distinct: ["businessDate"],
      }),
      canReadStore ? this.prisma.giftCardSale.groupBy({
        where: { storeId, businessDate: dateRange, deletedAt: null },
        by: ["businessDate"],
        _sum: { amountCents: true },
      }) : Promise.resolve([]),
    ]);
    const closed = new Set(
      closedDates.map((item) => item.businessDate.toISOString().slice(0, 10)),
    );
    const revenueByDate = new Map(workDates.map((item) => [
      item.businessDate.toISOString().slice(0, 10),
      item._sum.discountedFeePerformanceCents ?? 0n,
    ]));
    const salesByDate = new Map(giftCardDates.map((item) => [item.businessDate.toISOString().slice(0, 10), item._sum.amountCents ?? 0n]));
    return {
      closedDates: [...closed]
        .filter((date) => canReadStore || revenueByDate.has(date))
        .sort()
        .map((date) => ({ date, discountedFeePerformanceCents: revenueByDate.get(date) ?? 0n, revenueCents: calculateRevenue({ discountedFeePerformanceCents: revenueByDate.get(date) ?? 0n, giftCardSalesAmountCents: salesByDate.get(date) ?? 0n }) })),
      dates: workDates
        .map((item) => item.businessDate.toISOString().slice(0, 10))
        .filter((date) => !closed.has(date))
        .sort(),
    };
  }

  async getBoard(actor: User, storeId: string, businessDate: string) {
    const actorMembership = await this.access.requireActiveMembership(
      actor.id,
      storeId,
    );
    const store = await this.findStore(this.prisma, storeId);
    const currentDate = businessDateFor({
      startAt: deviceNow(),
      timezone: deviceTimezone(store.timezone),
      cutoffLocal: store.businessCutoffLocal,
    });
    const personalHistoryMembershipId =
      businessDate !== currentDate &&
      !hasStoreCapability(actorMembership.role, "FINANCE_READ_STORE")
        ? actorMembership.id
        : null;

    const board = await this.prisma.dailyBoard.findUnique({
      where: { storeId_businessDate: { storeId, businessDate: dateAtUtc(businessDate) } },
      include: {
        rows: {
          ...(personalHistoryMembershipId
            ? { where: { membershipId: personalHistoryMembershipId } }
            : {}),
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          include: {
            membership: {
              select: {
                id: true,
                displayName: true,
                role: true,
                isServiceProvider: true,
                employmentType: true,
                status: true,
              },
            },
          },
        },
      },
    });
    const [records, shifts, giftCardSales, closing] = await Promise.all([
      this.prisma.workRecord.findMany({
        where: {
          storeId,
          businessDate: dateAtUtc(businessDate),
          deletedAt: null,
          ...(personalHistoryMembershipId
            ? { employeeMembershipId: personalHistoryMembershipId }
            : {}),
        },
        orderBy: { startAt: "asc" },
        include: {
          employee: { select: { role: true } },
          serviceSnapshot: true,
          addonSnapshots: { orderBy: { position: "asc" } },
          discountSnapshots: { orderBy: { position: "asc" } },
          payment: true,
        },
      }),
      this.prisma.shift.findMany({
        where: {
          storeId,
          businessDate: dateAtUtc(businessDate),
          ...(personalHistoryMembershipId
            ? { membershipId: personalHistoryMembershipId }
            : {}),
        },
        orderBy: { clockInAt: "asc" },
      }),
      personalHistoryMembershipId
        ? Promise.resolve([])
        : this.prisma.giftCardSale.findMany({
            where: {
              storeId,
              businessDate: dateAtUtc(businessDate),
              deletedAt: null,
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            include: {
              operator: {
                select: { id: true, displayName: true, role: true, status: true },
              },
            },
          }),
      this.prisma.businessDayClosing.findFirst({
        where: {
          storeId,
          businessDate: dateAtUtc(businessDate),
          status: "CLOSED",
        },
        orderBy: { cycleNo: "desc" },
      }),
    ]);

    let recentClosedRevenue = null;
    if (closing && hasStoreCapability(actorMembership.role, "FINANCE_READ_STORE")) {
      const start = dateAtUtc(businessDate);
      start.setUTCDate(start.getUTCDate() - 29);
      const { closedDates } = await this.openWorkDates(actor, storeId, {
        dateFrom: start.toISOString().slice(0, 10),
        dateTo: businessDate,
      });
      const revenues = closedDates
        .filter((day) => day.date !== businessDate)
        .map((day) => day.revenueCents);
      // Include the selected closed day exactly once using the board’s current records.
      revenues.push(calculateRevenue({ discountedFeePerformanceCents: records.reduce((total, record) => total + record.discountedFeePerformanceCents, 0n), giftCardSalesAmountCents: giftCardSales.reduce((total, sale) => total + sale.amountCents, 0n) }));
      const averageCents = calculateAverageRevenue(revenues);
      if (averageCents !== null) {
        recentClosedRevenue = { dayCount: revenues.length, averageCents };
      }
    }

    const boardRows = personalHistoryMembershipId
      ? board?.rows ?? []
      : (board?.rows ?? []).filter(
          (row) =>
            !row.isHidden ||
            hasStoreCapability(actorMembership.role, "MEMBERSHIP_MANAGE"),
        );
    const rows = boardRows.map((row) => {
      const employeeRecords = records.filter(
        (record) => record.employeeMembershipId === row.membershipId,
      );
      const employeeShifts = shifts.filter(
        (shift) => shift.membershipId === row.membershipId,
      );
      return {
        ...row,
        shifts: employeeShifts,
        workRecords: employeeRecords,
        statistics: this.calculateRowStatistics(employeeRecords),
      };
    });
    const statistics = this.calculateRowStatistics(records);
    for (const sale of giftCardSales) {
      statistics.giftCardSaleCount += 1;
      statistics.giftCardCashCents += sale.cashCents;
      statistics.giftCardCardCents += sale.cardCents;
      statistics.giftCardSalesAmountCents += sale.amountCents;
    }
    statistics.storeIncomeCents = calculateStoreIncome(statistics);
    return {
      id: board?.id ?? null,
      storeId,
      businessDate,
      version: board?.version ?? 0,
      isClosed: Boolean(closing),
      closing: personalHistoryMembershipId ? null : closing,
      rows,
      giftCardSales: giftCardSales.sort((left, right) =>
        left.serialNumber.localeCompare(right.serialNumber, "zh-CN", {
          numeric: true,
          sensitivity: "base",
        }),
      ),
      nextGiftCardSerialNumber: String(store.nextGiftCardSerialNumber),
      statistics: {
        ...statistics,
        recentClosedRevenue,
        revenueCents: calculateRevenue(statistics),
        totalIncomeCents: calculateBoardTotalIncome({
          storeIncomeCents: statistics.storeIncomeCents,
          workers: records.map((record) => ({
            role: record.employee.role,
            incomeCents: record.totalLargeFeeWageCents + (record.totalTipCents ?? 0n),
          })),
        }),
      },
      ranking: {
        enabled: personalHistoryMembershipId
          ? false
          : store.automaticDispatchEnabled,
        rankedAt: personalHistoryMembershipId ? null : board?.rankedAt ?? null,
        explanation: hasStoreCapability(actorMembership.role, "MEMBERSHIP_MANAGE")
          ? rankingExplanationSchema.safeParse(board?.rankingExplanation).data ?? null
          : null,
      },
    };
  }

  async clockIn(
    actor: User,
    storeId: string,
    idempotencyKey: string,
    requestId: string,
  ) {
    const actorMembership = await this.access.requireActiveMembership(
      actor.id,
      storeId,
    );
    if (!actorMembership.isServiceProvider) {
      throw new ConflictException({
        code: "SERVICE_PROVIDER_DISABLED",
        messageZh: "你当前未参与记工，不能上班打卡",
      });
    }
    try {
      return await this.idempotency.execute(
        {
          storeId,
          userId: actor.id,
          key: idempotencyKey,
          route: "/api/v1/stores/:storeId/shifts/clock-in",
          payload: {},
          responseCode: 201,
        },
        async (transaction) => {
          const store = await this.findStore(transaction, storeId);
          const now = new Date();
          const businessDate = businessDateFor({
            startAt: now,
            timezone: deviceTimezone(store.timezone),
            cutoffLocal: store.businessCutoffLocal,
          });
          await this.assertDayOpen(transaction, storeId, businessDate);
          const membership = await transaction.storeMembership.findFirst({
            where: {
              id: actorMembership.id,
              storeId,
              status: "ACTIVE",
              deletedAt: null,
              isServiceProvider: true,
            },
          });
          if (!membership) {
            throw new ForbiddenException({
              code: "ACTIVE_MEMBERSHIP_REQUIRED",
              messageZh: "你不是这家店的在职记工成员",
            });
          }
          if (store.automaticDispatchEnabled && !membership.employmentType) {
            throw new ConflictException({
              code: "DAILY_RANKING_EMPLOYMENT_TYPE_REQUIRED",
              messageZh: "请先让店长为你设置全职或兼职",
            });
          }
          const openShift = await transaction.shift.findFirst({
            where: { storeId, membershipId: membership.id, clockOutAt: null },
          });
          if (openShift) {
            if (openShift.businessDate.getTime() === dateAtUtc(businessDate).getTime()) {
              throw new ConflictException({
                code: "SHIFT_ALREADY_OPEN",
                messageZh: "你已经上班并加入今日表格，请刷新页面",
                latestResource: openShift,
              });
            }
            const closed = await transaction.shift.updateMany({
              where: { id: openShift.id, clockOutAt: null, version: openShift.version },
              data: { clockOutAt: now, updatedBy: actor.id, version: { increment: 1 } },
            });
            if (closed.count !== 1) {
              throw new ConflictException({
                code: "SHIFT_VERSION_CONFLICT",
                messageZh: "旧营业日的上下班记录已发生变化，请重试",
              });
            }
            await transaction.auditLog.create({
              data: {
                storeId,
                actorUserId: actor.id,
                actorMembershipId: membership.id,
                source: "api",
                action: "shift.stale_auto_closed",
                entityType: "shift",
                entityId: openShift.id,
                businessDate: openShift.businessDate,
                beforeJson: { clockOutAt: null, version: openShift.version },
                afterJson: { clockOutAt: now.toISOString(), version: openShift.version + 1 },
                reason: "新营业日重新上班时自动结束遗留班次",
                requestId,
              },
            });
          }
          const shift = await transaction.shift.create({
            data: {
              storeId,
              membershipId: membership.id,
              businessDate: dateAtUtc(businessDate),
              clockInAt: now,
              createdBy: actor.id,
              updatedBy: actor.id,
            },
          });
          const { board, row } = await ensureBoardRow(
            transaction,
            storeId,
            businessDate,
            membership.id,
            actor.id,
          );
          await transaction.auditLog.create({
            data: {
              storeId,
              actorUserId: actor.id,
              actorMembershipId: membership.id,
              source: "api",
              action: "shift.clocked_in",
              entityType: "shift",
              entityId: shift.id,
              businessDate: shift.businessDate,
              afterJson: {
                membershipId: membership.id,
                clockInAt: shift.clockInAt.toISOString(),
                businessDate,
              },
              requestId,
            },
          });
          return { shift, board, row };
        },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException({
          code: "SHIFT_ALREADY_OPEN",
          messageZh: "你已经上班并加入今日表格，请刷新页面",
        });
      }
      throw error;
    }
  }

  async clockOut(
    actor: User,
    storeId: string,
    shiftId: string,
    input: ClockOutInput,
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
        route: "/api/v1/stores/:storeId/shifts/:shiftId/clock-out",
        payload: { shiftId, input },
        responseCode: 200,
      },
      async (transaction) => {
        const current = await transaction.shift.findFirst({
          where: { id: shiftId, storeId, membershipId: actorMembership.id },
        });
        if (!current) {
          throw new NotFoundException({
            code: "SHIFT_NOT_FOUND",
            messageZh: "没有找到你的这条上班记录",
          });
        }
        await this.assertDayOpen(
          transaction,
          storeId,
          current.businessDate.toISOString().slice(0, 10),
        );
        const changed = await transaction.shift.updateMany({
          where: {
            id: shiftId,
            storeId,
            membershipId: actorMembership.id,
            clockOutAt: null,
            version: input.version,
          },
          data: {
            clockOutAt: new Date(),
            updatedBy: actor.id,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) {
          const latest = await transaction.shift.findUnique({
            where: { id: shiftId },
          });
          throw new ConflictException({
            code: "SHIFT_VERSION_CONFLICT",
            messageZh: "上下班记录已发生变化，请刷新后重试",
            latestResource: latest,
          });
        }
        const shift = await transaction.shift.findUniqueOrThrow({
          where: { id: shiftId },
        });
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: actorMembership.id,
            source: "api",
            action: "shift.clocked_out",
            entityType: "shift",
            entityId: shift.id,
            businessDate: shift.businessDate,
            beforeJson: { clockOutAt: null, version: current.version },
            afterJson: {
              clockOutAt: shift.clockOutAt?.toISOString() ?? null,
              version: shift.version,
            },
            requestId,
          },
        });
        return shift;
      },
    );
  }

  async addRow(
    actor: User,
    storeId: string,
    businessDate: string,
    input: AddBoardRowInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const manager = await this.access.requireCapability(
      actor.id,
      storeId,
      "MEMBERSHIP_MANAGE",
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "/api/v1/stores/:storeId/boards/:date/rows",
        payload: { businessDate, input },
        responseCode: 201,
      },
      async (transaction) => {
        await this.assertDayOpen(transaction, storeId, businessDate);
        const member = await transaction.storeMembership.findFirst({
          where: {
            id: input.membershipId,
            storeId,
            status: "ACTIVE",
            deletedAt: null,
            isServiceProvider: true,
          },
        });
        if (!member) {
          throw new NotFoundException({
            code: "SERVICE_PROVIDER_NOT_FOUND",
            messageZh: "没有找到该店的在职服务人员",
          });
        }
        const store = await this.findStore(transaction, storeId);
        if (store.automaticDispatchEnabled && !member.employmentType) {
          throw new ConflictException({
            code: "DAILY_RANKING_EMPLOYMENT_TYPE_REQUIRED",
            messageZh: `请先设置全职或兼职：${member.displayName}`,
          });
        }
        const result = await ensureBoardRow(
          transaction,
          storeId,
          businessDate,
          member.id,
          actor.id,
        );
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: manager.id,
            source: "api",
            action: "board.row_added",
            entityType: "daily_employee_row",
            entityId: result.row.id,
            businessDate: dateAtUtc(businessDate),
            afterJson: {
              membershipId: member.id,
              displayName: member.displayName,
              boardVersion: result.board.version,
            },
            requestId,
          },
        });
        return result;
      },
    );
  }

  async updateRow(
    actor: User,
    storeId: string,
    businessDate: string,
    rowId: string,
    input: UpdateBoardRowInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const manager = await this.access.requireCapability(
      actor.id,
      storeId,
      "MEMBERSHIP_MANAGE",
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "/api/v1/stores/:storeId/boards/:date/rows/:rowId",
        payload: { businessDate, rowId, input },
        responseCode: 200,
      },
      async (transaction) => {
        await this.assertDayOpen(transaction, storeId, businessDate);
        const row = await transaction.dailyEmployeeRow.findFirst({
          where: {
            id: rowId,
            storeId,
            board: { businessDate: dateAtUtc(businessDate) },
          },
        });
        if (!row) this.throwRowNotFound();
        if (row.version !== input.version) {
          await this.throwRowConflict(transaction, rowId, storeId);
        }
        // Include deleted records: their recoverable history must remain intact.
        const removed = input.isHidden && await transaction.workRecord.count({
          where: {
            storeId,
            employeeMembershipId: row.membershipId,
            businessDate: dateAtUtc(businessDate),
          },
        }) === 0;
        const changed = await transaction.dailyEmployeeRow.updateMany({
          where: { id: rowId, storeId, version: input.version },
          data: { isHidden: input.isHidden, version: { increment: 1 } },
        });
        if (changed.count !== 1) {
          await this.throwRowConflict(transaction, rowId, storeId);
        }
        const updated = await transaction.dailyEmployeeRow.findUniqueOrThrow({
          where: { id: rowId },
        });
        let removedShiftCount = 0;
        if (removed) {
          const shifts = await transaction.shift.deleteMany({
            where: { storeId, membershipId: row.membershipId, businessDate: dateAtUtc(businessDate) },
          });
          removedShiftCount = shifts.count;
          await transaction.dailyEmployeeRow.delete({ where: { id: rowId } });
        }
        const board = await transaction.dailyBoard.update({
          where: { id: row.boardId },
          data: { version: { increment: 1 } },
        });
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: manager.id,
            source: "api",
            action: removed ? "board.row_removed" : input.isHidden ? "board.row_hidden" : "board.row_shown",
            entityType: "daily_employee_row",
            entityId: rowId,
            businessDate: dateAtUtc(businessDate),
            beforeJson: { membershipId: row.membershipId, isHidden: row.isHidden, version: row.version },
            afterJson: {
              removed,
              removedShiftCount,
              isHidden: updated.isHidden,
              version: updated.version,
              boardVersion: board.version,
            },
            requestId,
          },
        });
        return { row: updated, board, removed };
      },
    );
  }

  async removeRow(
    actor: User,
    storeId: string,
    businessDate: string,
    rowId: string,
    input: RemoveBoardRowInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const manager = await this.access.requireCapability(
      actor.id,
      storeId,
      "MEMBERSHIP_MANAGE",
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "/api/v1/stores/:storeId/boards/:date/rows/:rowId/remove",
        payload: { businessDate, rowId, input },
        responseCode: 200,
      },
      async (transaction) => {
        await this.assertDayOpen(transaction, storeId, businessDate);
        const store = await this.findStore(transaction, storeId);
        if (!store.automaticDispatchEnabled) {
          throw new ConflictException({
            code: "DAILY_RANKING_DISABLED",
            messageZh: "每日开门排位尚未开启",
          });
        }
        const row = await transaction.dailyEmployeeRow.findFirst({
          where: {
            id: rowId,
            storeId,
            board: { businessDate: dateAtUtc(businessDate) },
          },
        });
        if (!row) this.throwRowNotFound();
        if (row.version !== input.version) {
          await this.throwRowConflict(transaction, rowId, storeId);
        }
        const [shiftCount, workRecordCount] = await Promise.all([
          transaction.shift.count({
            where: {
              storeId,
              membershipId: row.membershipId,
              businessDate: dateAtUtc(businessDate),
            },
          }),
          transaction.workRecord.count({
            where: {
              storeId,
              employeeMembershipId: row.membershipId,
              businessDate: dateAtUtc(businessDate),
            },
          }),
        ]);
        if (shiftCount + workRecordCount > 0) {
          throw new ConflictException({
            code: "BOARD_ROW_HAS_ACTIVITY",
            messageZh: "该员工今天已有打卡或记工，不能移除；可以改为隐藏",
          });
        }
        const board = await transaction.dailyBoard.findUniqueOrThrow({
          where: { id: row.boardId },
          include: {
            rows: {
              where: { id: { not: row.id } },
              orderBy: [{ position: "asc" }, { createdAt: "asc" }],
            },
          },
        });
        await transaction.dailyEmployeeRow.delete({ where: { id: row.id } });
        for (const [index, remaining] of board.rows.entries()) {
          await transaction.dailyEmployeeRow.update({
            where: { id: remaining.id },
            data: {
              position: new Prisma.Decimal(index + 1),
              version: { increment: 1 },
            },
          });
        }
        const updated = await transaction.dailyBoard.update({
          where: { id: board.id },
          data: { version: { increment: 1 } },
        });
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: manager.id,
            source: "api",
            action: "board.row_removed",
            entityType: "daily_employee_row",
            entityId: row.id,
            businessDate: dateAtUtc(businessDate),
            beforeJson: {
              membershipId: row.membershipId,
              version: row.version,
            },
            afterJson: { boardVersion: updated.version },
            requestId,
          },
        });
        return updated;
      },
    );
  }

  async reorder(
    actor: User,
    storeId: string,
    businessDate: string,
    input: ReorderBoardInput,
    idempotencyKey: string,
    requestId: string,
  ) {
    const manager = await this.access.requireCapability(
      actor.id,
      storeId,
      "MEMBERSHIP_MANAGE",
    );
    return this.idempotency.execute(
      {
        storeId,
        userId: actor.id,
        key: idempotencyKey,
        route: "/api/v1/stores/:storeId/boards/:date/reorder",
        payload: { businessDate, input },
        responseCode: 200,
      },
      async (transaction) => {
        await this.assertDayOpen(transaction, storeId, businessDate);
        const board = await transaction.dailyBoard.findUnique({
          where: {
            storeId_businessDate: {
              storeId,
              businessDate: dateAtUtc(businessDate),
            },
          },
          include: { rows: { select: { id: true } } },
        });
        if (!board) {
          throw new NotFoundException({
            code: "BOARD_NOT_FOUND",
            messageZh: "该营业日还没有员工表格",
          });
        }
        const actualIds = board.rows.map((row) => row.id).sort();
        const requestedIds = [...input.rowIds].sort();
        if (
          new Set(input.rowIds).size !== input.rowIds.length ||
          actualIds.length !== requestedIds.length ||
          actualIds.some((id, index) => id !== requestedIds[index])
        ) {
          throw new BadRequestException({
            code: "BOARD_ROWS_MISMATCH",
            messageZh: "排序列表必须完整包含当前表格的全部员工行",
          });
        }
        const changed = await transaction.dailyBoard.updateMany({
          where: { id: board.id, version: input.version },
          data: { version: { increment: 1 } },
        });
        if (changed.count !== 1) {
          const latest = await transaction.dailyBoard.findUnique({
            where: { id: board.id },
          });
          throw new ConflictException({
            code: "BOARD_VERSION_CONFLICT",
            messageZh: "员工顺序已被其他设备修改，请刷新后重试",
            latestResource: latest,
          });
        }
        for (const [position, rowId] of input.rowIds.entries()) {
          await transaction.dailyEmployeeRow.update({
            where: { id: rowId },
            data: {
              position: new Prisma.Decimal(position + 1),
              version: { increment: 1 },
            },
          });
        }
        const updated = await transaction.dailyBoard.findUniqueOrThrow({
          where: { id: board.id },
          include: {
            rows: { orderBy: { position: "asc" } },
          },
        });
        await transaction.auditLog.create({
          data: {
            storeId,
            actorUserId: actor.id,
            actorMembershipId: manager.id,
            source: "api",
            action: "board.rows_reordered",
            entityType: "daily_board",
            entityId: board.id,
            businessDate: dateAtUtc(businessDate),
            beforeJson: { rowIds: board.rows.map((row) => row.id), version: board.version },
            afterJson: { rowIds: input.rowIds, version: updated.version },
            requestId,
          },
        });
        return updated;
      },
    );
  }

  private calculateRowStatistics(
    records: Array<{
      grossFeeBaseCents: bigint;
      discountTotalCents: bigint;
      discountedFeePerformanceCents: bigint;
      totalTipCents: bigint | null;
      totalLargeFeeWageCents: bigint;
      giftCardServiceCents: bigint | null;
      giftCardTipCents: bigint | null;
    }>,
  ) {
    const statistics = records.reduce<BoardStatistics>(
      (total, record) => {
        const totalTipCents = record.totalTipCents ?? 0n;
        const employeeIncomeCents =
          record.totalLargeFeeWageCents + totalTipCents;
        return {
          recordCount: total.recordCount + 1,
          grossFeeBaseCents:
            total.grossFeeBaseCents + record.grossFeeBaseCents,
          discountTotalCents:
            total.discountTotalCents + record.discountTotalCents,
          discountedFeePerformanceCents:
            total.discountedFeePerformanceCents +
            record.discountedFeePerformanceCents,
          totalTipCents: total.totalTipCents + totalTipCents,
          totalLargeFeeWageCents:
            total.totalLargeFeeWageCents + record.totalLargeFeeWageCents,
          employeeIncomeCents:
            total.employeeIncomeCents + employeeIncomeCents,
          giftCardSaleCount: total.giftCardSaleCount,
          giftCardCashCents: total.giftCardCashCents,
          giftCardCardCents: total.giftCardCardCents,
          giftCardSalesAmountCents: total.giftCardSalesAmountCents,
          giftCardRedemptionCents:
            total.giftCardRedemptionCents +
            (record.giftCardServiceCents ?? 0n) +
            (record.giftCardTipCents ?? 0n),
          storeIncomeCents: total.storeIncomeCents,
        };
      },
      {
        recordCount: 0,
        grossFeeBaseCents: 0n,
        discountTotalCents: 0n,
        discountedFeePerformanceCents: 0n,
        totalTipCents: 0n,
        totalLargeFeeWageCents: 0n,
        employeeIncomeCents: 0n,
        giftCardSaleCount: 0,
        giftCardCashCents: 0n,
        giftCardCardCents: 0n,
        giftCardSalesAmountCents: 0n,
        giftCardRedemptionCents: 0n,
        storeIncomeCents: 0n,
      },
    );
    statistics.storeIncomeCents = calculateStoreIncome(statistics);
    return statistics;
  }

  private async findStore(
    client: Pick<PrismaService, "store"> | Prisma.TransactionClient,
    storeId: string,
  ) {
    const store = await client.store.findFirst({
      where: { id: storeId, status: "ACTIVE", deletedAt: null },
      select: {
        id: true,
        timezone: true,
        businessCutoffLocal: true,
        automaticDispatchEnabled: true,
        nextGiftCardSerialNumber: true,
        version: true,
        weeklyDispatchJson: true,
        weeklyDispatchEffectiveFrom: true,
      },
    });
    if (!store) {
      throw new NotFoundException({
        code: "STORE_NOT_FOUND",
        messageZh: "店铺不存在或已停用",
      });
    }
    return store;
  }

  private async assertDayOpen(
    transaction: Prisma.TransactionClient,
    storeId: string,
    businessDate: string,
  ) {
    await lockBusinessDay(transaction, storeId, businessDate);
    const closing = await transaction.businessDayClosing.findFirst({
      where: {
        storeId,
        businessDate: dateAtUtc(businessDate),
        status: "CLOSED",
      },
      select: { id: true },
    });
    if (closing) {
      throw new ConflictException({
        code: "BUSINESS_DAY_CLOSED",
        messageZh: "该营业日已经日结，请先取消日结再修改表格",
      });
    }
  }

  private async throwRowConflict(
    transaction: Prisma.TransactionClient,
    rowId: string,
    storeId: string,
  ): Promise<never> {
    const latest = await transaction.dailyEmployeeRow.findFirst({
      where: { id: rowId, storeId },
    });
    if (!latest) this.throwRowNotFound();
    throw new ConflictException({
      code: "BOARD_ROW_VERSION_CONFLICT",
      messageZh: "员工行已被其他设备修改，请刷新后重试",
      latestResource: latest,
    });
  }

  private throwRowNotFound(): never {
    throw new NotFoundException({
      code: "BOARD_ROW_NOT_FOUND",
      messageZh: "没有找到该员工行",
    });
  }
}
