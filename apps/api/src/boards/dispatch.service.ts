import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, type DispatchKind, type User } from "@massage-note/database";
import type {
  CancelDispatchIntentInput,
  CreateDispatchIntentInput,
  RankBoardInput,
  RemoveBoardRowInput,
  SkipDispatchTurnInput,
} from "@massage-note/contracts";
import {
  initialProcessedTurnsForLateArrival,
  rankRotationCandidates,
  sortNormalTurnCandidates,
} from "@massage-note/domain";
import { lockBusinessDay } from "../common/business-day-lock.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";

const dateAtUtc = (date: string) => new Date(`${date}T00:00:00.000Z`);
const nonFaultReasons = new Set(["BUSY", "INELIGIBLE", "CUSTOMER_DECLINED", "STORE_RESTRICTION"]);

type Transaction = Prisma.TransactionClient;

interface DispatchRow {
  id: string;
  membershipId: string;
  position: Prisma.Decimal;
  isHidden: boolean;
  normalTurnsProcessed: number;
  crossedTurns: number;
  rotationRankedAt: Date | null;
  createdAt: Date;
  membership: { displayName: string; employmentType: "FULL_TIME" | "PART_TIME" | null };
}

@Injectable()
export class DispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoreAccessService,
    private readonly idempotency: IdempotencyService,
  ) {}

  async rank(actor: User, storeId: string, businessDate: string, input: RankBoardInput, key: string, requestId: string) {
    const manager = await this.access.requireCapability(actor.id, storeId, "MEMBERSHIP_MANAGE");
    return this.idempotency.execute({ storeId, userId: actor.id, key, route: "/api/v1/stores/:storeId/boards/:date/rank", payload: { businessDate, input }, responseCode: 200 }, async (transaction) => {
      await this.assertOpenEnabled(transaction, storeId, businessDate);
      const board = await this.boardWithRows(transaction, storeId, businessDate);
      this.assertVersion(board.version, input.version);
      const activeRows = board.rows.filter((row) => !row.isHidden);
      if (activeRows.length === 0) throw new ConflictException({ code: "DISPATCH_BOARD_EMPTY", messageZh: "请先添加今天上班的员工" });
      const missing = activeRows.filter((row) => !row.membership.employmentType);
      if (missing.length > 0) throw new ConflictException({ code: "DISPATCH_EMPLOYMENT_TYPE_REQUIRED", messageZh: `请先设置全职或兼职：${missing.map((row) => row.membership.displayName).join("、")}` });

      const activeBefore = board.rows.filter((row) => !row.isHidden && row.rotationRankedAt);
      const nextBefore = sortNormalTurnCandidates(activeBefore.map((row) => ({ membershipId: row.membershipId, normalTurnsProcessed: row.normalTurnsProcessed, position: Number(row.position) })))[0] ?? null;
      const minimumProcessed = activeBefore.length > 0 ? Math.min(...activeBefore.map((row) => row.normalTurnsProcessed)) : 0;

      const histories = await Promise.all(activeRows.map(async (row) => {
        const previous = await transaction.dailyEmployeeRow.findFirst({
          where: { membershipId: row.membershipId, storeId, board: { businessDate: { lt: dateAtUtc(businessDate) } } },
          orderBy: [{ board: { businessDate: "desc" } }],
          select: { position: true, board: { select: { businessDate: true } } },
        });
        return {
          membershipId: row.membershipId,
          employmentType: row.membership.employmentType!,
          lastPosition: previous ? Number(previous.position) : null,
          lastBusinessDate: previous?.board.businessDate.toISOString().slice(0, 10) ?? null,
          addedAt: row.createdAt.toISOString(),
        };
      }));
      const order = rankRotationCandidates(histories);
      const now = new Date();
      for (const [index, membershipId] of order.entries()) {
        const row = board.rows.find((candidate) => candidate.membershipId === membershipId)!;
        const newPosition = index + 1;
        const firstRanking = row.rotationRankedAt === null;
        const processed = firstRanking && activeBefore.length > 0
          ? initialProcessedTurnsForLateArrival({ nextNormalPosition: nextBefore ? order.indexOf(nextBefore.membershipId) + 1 : null, newPosition, minimumProcessedTurns: minimumProcessed })
          : row.normalTurnsProcessed;
        await transaction.dailyEmployeeRow.update({
          where: { id: row.id },
          data: {
            position: new Prisma.Decimal(newPosition),
            normalTurnsProcessed: processed,
            ...(firstRanking ? { crossedTurns: { increment: processed } } : {}),
            rotationRankedAt: now,
            version: { increment: 1 },
          },
        });
      }
      const sequence = board.dispatchSequence + 1;
      const updated = await transaction.dailyBoard.update({ where: { id: board.id }, data: { rankedAt: now, dispatchSequence: sequence, version: { increment: 1 } } });
      await transaction.dispatchEvent.create({ data: { boardId: board.id, storeId, sequence, kind: "BOARD_RANKED", detailJson: { order }, actorUserId: actor.id } });
      await transaction.auditLog.create({ data: { storeId, actorUserId: actor.id, actorMembershipId: manager.id, source: "api", action: "dispatch.board_ranked", entityType: "daily_board", entityId: board.id, businessDate: dateAtUtc(businessDate), afterJson: { order, version: updated.version }, requestId } });
      return this.getStateWith(transaction, storeId, businessDate);
    });
  }

  async createIntent(actor: User, storeId: string, businessDate: string, input: CreateDispatchIntentInput, key: string, requestId: string) {
    const manager = await this.access.requireCapability(actor.id, storeId, "MEMBERSHIP_MANAGE");
    return this.idempotency.execute({ storeId, userId: actor.id, key, route: "/api/v1/stores/:storeId/boards/:date/dispatch-intents", payload: { businessDate, input }, responseCode: 201 }, async (transaction) => {
      await this.assertOpenEnabled(transaction, storeId, businessDate);
      const board = await this.boardWithRows(transaction, storeId, businessDate);
      this.assertVersion(board.version, input.version);
      if (!board.rankedAt) throw new ConflictException({ code: "DISPATCH_BOARD_NOT_RANKED", messageZh: "请先点击自动排位" });

      let selected: DispatchRow;
      let consumedMakeupTurnId: string | null = null;
      let sequence = board.dispatchSequence;
      if (input.kind === "REGULAR") {
        const next = await this.findNext(transaction, board);
        if (!next.candidate) throw new ConflictException({ code: "DISPATCH_NO_AVAILABLE_PROVIDER", messageZh: "目前没有空闲且可排工的员工" });
        if (input.membershipId && input.membershipId !== next.candidate.row.membershipId) {
          throw new ConflictException({ code: "DISPATCH_WRONG_PROVIDER", messageZh: `普通排工下一位应是 ${next.candidate.row.membership.displayName}`, latestResource: { membershipId: next.candidate.row.membershipId, displayName: next.candidate.row.membership.displayName } });
        }
        for (const skipped of next.skippedNormalBusy) {
          sequence += 1;
          await transaction.dailyEmployeeRow.update({ where: { id: skipped.id }, data: { normalTurnsProcessed: { increment: 1 }, version: { increment: 1 } } });
          await transaction.dispatchMakeupTurn.create({ data: { boardId: board.id, storeId, employeeMembershipId: skipped.membershipId, reason: "BUSY", sequence } });
          await transaction.dispatchEvent.create({ data: { boardId: board.id, storeId, employeeMembershipId: skipped.membershipId, sequence, kind: "TURN_SKIPPED_BUSY", actorUserId: actor.id } });
        }
        selected = next.candidate.row;
        sequence += 1;
        if (next.candidate.makeupId) {
          consumedMakeupTurnId = next.candidate.makeupId;
          await transaction.dispatchMakeupTurn.update({ where: { id: next.candidate.makeupId }, data: { status: "CONSUMED", consumedAt: new Date() } });
        } else {
          await transaction.dailyEmployeeRow.update({ where: { id: selected.id }, data: { normalTurnsProcessed: { increment: 1 }, version: { increment: 1 } } });
        }
      } else {
        selected = this.selectedActiveRow(board.rows, input.membershipId!);
        sequence += 1;
        if (input.kind === "CLIENT_REQUESTED") {
          const makeup = await transaction.dispatchMakeupTurn.findFirst({ where: { boardId: board.id, employeeMembershipId: selected.membershipId, status: "PENDING" }, orderBy: [{ sequence: "asc" }, { createdAt: "asc" }] });
          if (makeup) {
            consumedMakeupTurnId = makeup.id;
            await transaction.dispatchMakeupTurn.update({ where: { id: makeup.id }, data: { status: "CONSUMED", consumedAt: new Date() } });
          }
          else await transaction.dailyEmployeeRow.update({ where: { id: selected.id }, data: { normalTurnsProcessed: { increment: 1 }, version: { increment: 1 } } });
        }
      }

      const updatedBoard = await transaction.dailyBoard.update({ where: { id: board.id }, data: { dispatchSequence: sequence, version: { increment: 1 } } });
      const intent = await transaction.dispatchIntent.create({ data: { boardId: board.id, storeId, employeeMembershipId: selected.membershipId, kind: input.kind, sequence, boardVersion: updatedBoard.version, createdBy: actor.id, consumedMakeupTurnId } });
      await transaction.dispatchEvent.create({ data: { boardId: board.id, storeId, employeeMembershipId: selected.membershipId, sequence, kind: `INTENT_${input.kind}`, detailJson: { intentId: intent.id }, actorUserId: actor.id } });
      await transaction.auditLog.create({ data: { storeId, actorUserId: actor.id, actorMembershipId: manager.id, source: "api", action: "dispatch.intent_created", entityType: "dispatch_intent", entityId: intent.id, businessDate: dateAtUtc(businessDate), afterJson: { kind: intent.kind, membershipId: intent.employeeMembershipId, sequence }, requestId } });
      return intent;
    });
  }

  async skip(actor: User, storeId: string, businessDate: string, input: SkipDispatchTurnInput, key: string, requestId: string) {
    const manager = await this.access.requireCapability(actor.id, storeId, "MEMBERSHIP_MANAGE");
    return this.idempotency.execute({ storeId, userId: actor.id, key, route: "/api/v1/stores/:storeId/boards/:date/dispatch-skip", payload: { businessDate, input }, responseCode: 200 }, async (transaction) => {
      await this.assertOpenEnabled(transaction, storeId, businessDate);
      const board = await this.boardWithRows(transaction, storeId, businessDate);
      this.assertVersion(board.version, input.version);
      const next = await this.findNext(transaction, board, false);
      if (!next.candidate || next.candidate.row.membershipId !== input.membershipId) throw new ConflictException({ code: "DISPATCH_WRONG_PROVIDER", messageZh: "排工顺序已经变化，请刷新后重试" });
      let sequence = board.dispatchSequence + 1;
      const preserve = nonFaultReasons.has(input.reason);
      if (next.candidate.makeupId) {
        await transaction.dispatchMakeupTurn.update({ where: { id: next.candidate.makeupId }, data: { status: "CONSUMED", consumedAt: new Date() } });
        if (preserve) {
          await transaction.dispatchMakeupTurn.create({ data: { boardId: board.id, storeId, employeeMembershipId: input.membershipId, reason: input.reason, sequence } });
        } else {
          await transaction.dailyEmployeeRow.update({ where: { id: next.candidate.row.id }, data: { crossedTurns: { increment: 1 }, version: { increment: 1 } } });
        }
      } else {
        await transaction.dailyEmployeeRow.update({ where: { id: next.candidate.row.id }, data: { normalTurnsProcessed: { increment: 1 }, ...(preserve ? {} : { crossedTurns: { increment: 1 } }), version: { increment: 1 } } });
        if (preserve) await transaction.dispatchMakeupTurn.create({ data: { boardId: board.id, storeId, employeeMembershipId: input.membershipId, reason: input.reason, sequence } });
      }
      const updated = await transaction.dailyBoard.update({ where: { id: board.id }, data: { dispatchSequence: sequence, version: { increment: 1 } } });
      await transaction.dispatchEvent.create({ data: { boardId: board.id, storeId, employeeMembershipId: input.membershipId, sequence, kind: preserve ? "TURN_PRESERVED" : "TURN_CROSSED", detailJson: { reason: input.reason }, actorUserId: actor.id } });
      await transaction.auditLog.create({ data: { storeId, actorUserId: actor.id, actorMembershipId: manager.id, source: "api", action: "dispatch.turn_skipped", entityType: "daily_board", entityId: board.id, businessDate: dateAtUtc(businessDate), afterJson: { membershipId: input.membershipId, reason: input.reason, version: updated.version }, requestId } });
      return this.getStateWith(transaction, storeId, businessDate);
    });
  }

  async cancelIntent(actor: User, storeId: string, businessDate: string, intentId: string, input: CancelDispatchIntentInput, key: string, requestId: string) {
    const manager = await this.access.requireCapability(actor.id, storeId, "MEMBERSHIP_MANAGE");
    return this.idempotency.execute({ storeId, userId: actor.id, key, route: "/api/v1/stores/:storeId/boards/:date/dispatch-intents/:intentId/cancel", payload: { businessDate, intentId, input }, responseCode: 200 }, async (transaction) => {
      await this.assertOpenEnabled(transaction, storeId, businessDate);
      const intent = await transaction.dispatchIntent.findFirst({ where: { id: intentId, storeId, board: { businessDate: dateAtUtc(businessDate) } } });
      if (!intent) throw new NotFoundException({ code: "DISPATCH_INTENT_NOT_FOUND", messageZh: "没有找到这条待记工派工" });
      if (intent.status !== "PENDING" || intent.version !== input.version) throw new ConflictException({ code: "DISPATCH_INTENT_CONFLICT", messageZh: "这条派工已经开始或被取消" });
      const board = await transaction.dailyBoard.findUniqueOrThrow({ where: { id: intent.boardId } });
      const sequence = board.dispatchSequence + 1;
      const updatedIntent = await transaction.dispatchIntent.update({ where: { id: intent.id }, data: { status: "CANCELLED", cancelledAt: new Date(), version: { increment: 1 } } });
      if (intent.kind !== "STORE_ASSIGNED") await transaction.dispatchMakeupTurn.create({ data: { boardId: board.id, storeId, employeeMembershipId: intent.employeeMembershipId, reason: "INTENT_CANCELLED", sequence } });
      await transaction.dailyBoard.update({ where: { id: board.id }, data: { dispatchSequence: sequence, version: { increment: 1 } } });
      await transaction.dispatchEvent.create({ data: { boardId: board.id, storeId, employeeMembershipId: intent.employeeMembershipId, sequence, kind: "INTENT_CANCELLED", detailJson: { intentId }, actorUserId: actor.id } });
      await transaction.auditLog.create({ data: { storeId, actorUserId: actor.id, actorMembershipId: manager.id, source: "api", action: "dispatch.intent_cancelled", entityType: "dispatch_intent", entityId: intent.id, businessDate: dateAtUtc(businessDate), afterJson: { status: updatedIntent.status }, requestId } });
      return updatedIntent;
    });
  }

  async removeRow(actor: User, storeId: string, businessDate: string, rowId: string, input: RemoveBoardRowInput, key: string, requestId: string) {
    const manager = await this.access.requireCapability(actor.id, storeId, "MEMBERSHIP_MANAGE");
    return this.idempotency.execute({ storeId, userId: actor.id, key, route: "/api/v1/stores/:storeId/boards/:date/rows/:rowId/remove", payload: { businessDate, rowId, input }, responseCode: 200 }, async (transaction) => {
      await this.assertOpenEnabled(transaction, storeId, businessDate);
      const row = await transaction.dailyEmployeeRow.findFirst({ where: { id: rowId, storeId, board: { businessDate: dateAtUtc(businessDate) } } });
      if (!row) throw new NotFoundException({ code: "BOARD_ROW_NOT_FOUND", messageZh: "没有找到这名今日员工" });
      if (row.version !== input.version) throw new ConflictException({ code: "BOARD_ROW_VERSION_CONFLICT", messageZh: "员工状态已经变化，请刷新后重试" });
      const [shifts, records, intents, makeups] = await Promise.all([
        transaction.shift.count({ where: { storeId, membershipId: row.membershipId, businessDate: dateAtUtc(businessDate) } }),
        transaction.workRecord.count({ where: { storeId, employeeMembershipId: row.membershipId, businessDate: dateAtUtc(businessDate), deletedAt: null } }),
        transaction.dispatchIntent.count({ where: { boardId: row.boardId, employeeMembershipId: row.membershipId } }),
        transaction.dispatchMakeupTurn.count({ where: { boardId: row.boardId, employeeMembershipId: row.membershipId } }),
      ]);
      if (shifts + records + intents + makeups > 0 || row.normalTurnsProcessed > 0 || row.crossedTurns > 0) throw new ConflictException({ code: "BOARD_ROW_HAS_ACTIVITY", messageZh: "该员工今天已有打卡、记工或排工记录，不能移除；可以改为隐藏" });
      const board = await transaction.dailyBoard.findUniqueOrThrow({ where: { id: row.boardId } });
      await transaction.dailyEmployeeRow.delete({ where: { id: row.id } });
      const updated = await transaction.dailyBoard.update({ where: { id: board.id }, data: { version: { increment: 1 } } });
      await transaction.auditLog.create({ data: { storeId, actorUserId: actor.id, actorMembershipId: manager.id, source: "api", action: "board.row_removed", entityType: "daily_employee_row", entityId: row.id, businessDate: dateAtUtc(businessDate), beforeJson: { membershipId: row.membershipId, version: row.version }, afterJson: { boardVersion: updated.version }, requestId } });
      return updated;
    });
  }

  async getState(storeId: string, businessDate: string) {
    return this.getStateWith(this.prisma, storeId, businessDate);
  }

  async validateIntent(transaction: Transaction, storeId: string, businessDate: string, membershipId: string, intentId: string) {
    const intent = await transaction.dispatchIntent.findFirst({ where: { id: intentId, storeId, employeeMembershipId: membershipId, status: "PENDING", board: { businessDate: dateAtUtc(businessDate) } } });
    if (!intent) throw new ConflictException({ code: "DISPATCH_INTENT_REQUIRED", messageZh: "派工已经变化，请从今日排工重新开始记工" });
    return intent;
  }

  async consumeIntent(transaction: Transaction, intentId: string, workRecordId: string) {
    const intent = await transaction.dispatchIntent.update({ where: { id: intentId }, data: { status: "CONSUMED", consumedAt: new Date(), workRecordId, version: { increment: 1 } } });
    if (intent.consumedMakeupTurnId) await transaction.dispatchMakeupTurn.update({ where: { id: intent.consumedMakeupTurnId }, data: { consumedWorkRecordId: workRecordId } });
    await transaction.dailyBoard.update({ where: { id: intent.boardId }, data: { version: { increment: 1 } } });
  }

  async returnDeletedRecordTurn(transaction: Transaction, actor: User, record: { id: string; storeId: string; employeeMembershipId: string; businessDate: Date; dispatchKind: DispatchKind | null }) {
    if (record.dispatchKind !== "REGULAR" && record.dispatchKind !== "CLIENT_REQUESTED") return;
    const board = await transaction.dailyBoard.findUnique({ where: { storeId_businessDate: { storeId: record.storeId, businessDate: record.businessDate } } });
    if (!board) return;
    const existing = await transaction.dispatchMakeupTurn.findFirst({ where: { boardId: board.id, sourceWorkRecordId: record.id } });
    if (existing) return;
    const sequence = board.dispatchSequence + 1;
    await transaction.dispatchMakeupTurn.create({ data: { boardId: board.id, storeId: record.storeId, employeeMembershipId: record.employeeMembershipId, reason: "RECORD_DELETED", sequence, sourceWorkRecordId: record.id } });
    await transaction.dailyBoard.update({ where: { id: board.id }, data: { dispatchSequence: sequence, version: { increment: 1 } } });
    await transaction.dispatchEvent.create({ data: { boardId: board.id, storeId: record.storeId, employeeMembershipId: record.employeeMembershipId, sequence, kind: "TURN_RETURNED_RECORD_DELETED", workRecordId: record.id, actorUserId: actor.id } });
  }

  async reverseReturnedTurnForRestore(transaction: Transaction, actor: User, record: { id: string; storeId: string; employeeMembershipId: string; businessDate: Date }) {
    const makeup = await transaction.dispatchMakeupTurn.findFirst({ where: { sourceWorkRecordId: record.id }, orderBy: { createdAt: "desc" } });
    if (!makeup) return;
    const board = await transaction.dailyBoard.findUniqueOrThrow({ where: { id: makeup.boardId } });
    const sequence = board.dispatchSequence + 1;
    if (makeup.status === "PENDING") {
      await transaction.dispatchMakeupTurn.update({ where: { id: makeup.id }, data: { status: "EXPIRED" } });
    } else if (makeup.status === "CONSUMED") {
      const row = await transaction.dailyEmployeeRow.findUnique({ where: { boardId_membershipId: { boardId: board.id, membershipId: record.employeeMembershipId } } });
      if (row) await transaction.dailyEmployeeRow.update({ where: { id: row.id }, data: { normalTurnsProcessed: { increment: 1 }, version: { increment: 1 } } });
    }
    await transaction.dailyBoard.update({ where: { id: board.id }, data: { dispatchSequence: sequence, version: { increment: 1 } } });
    await transaction.dispatchEvent.create({ data: { boardId: board.id, storeId: record.storeId, employeeMembershipId: record.employeeMembershipId, sequence, kind: "TURN_RETURN_REVERSED_RECORD_RESTORED", workRecordId: record.id, actorUserId: actor.id } });
  }

  private async getStateWith(client: PrismaService | Transaction, storeId: string, businessDate: string) {
    const store = await client.store.findUnique({ where: { id: storeId }, select: { automaticDispatchEnabled: true } });
    const board = await client.dailyBoard.findUnique({
      where: { storeId_businessDate: { storeId, businessDate: dateAtUtc(businessDate) } },
      include: {
        rows: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], include: { membership: { select: { displayName: true, employmentType: true } } } },
        dispatchIntents: { where: { status: "PENDING" }, orderBy: { sequence: "asc" } },
        dispatchMakeups: { where: { status: "PENDING" }, orderBy: [{ sequence: "asc" }, { createdAt: "asc" }] },
        dispatchEvents: { orderBy: { sequence: "desc" }, take: 50 },
      },
    });
    if (!board) return { enabled: Boolean(store?.automaticDispatchEnabled), rankedAt: null, next: null, pendingIntents: [], events: [], rowStates: {} };
    const next = board.rankedAt ? await this.findNext(client, board) : { candidate: null, skippedNormalBusy: [] };
    const makeupCounts = new Map<string, number>();
    for (const makeup of board.dispatchMakeups) makeupCounts.set(makeup.employeeMembershipId, (makeupCounts.get(makeup.employeeMembershipId) ?? 0) + 1);
    return {
      enabled: Boolean(store?.automaticDispatchEnabled),
      rankedAt: board.rankedAt,
      next: next.candidate ? { membershipId: next.candidate.row.membershipId, displayName: next.candidate.row.membership.displayName, source: next.candidate.makeupId ? "MAKEUP" : "NORMAL" } : null,
      pendingIntents: board.dispatchIntents,
      events: board.dispatchEvents,
      rowStates: Object.fromEntries(board.rows.map((row) => [row.membershipId, { normalTurnsProcessed: row.normalTurnsProcessed, crossedTurns: row.crossedTurns, makeupTurns: makeupCounts.get(row.membershipId) ?? 0 }])),
    };
  }

  private async findNext(client: PrismaService | Transaction, board: { id: string; storeId: string; rows: DispatchRow[] }, includeAutoBusy = true) {
    const activeRows = board.rows.filter((row) => !row.isHidden && row.rotationRankedAt);
    const activeIds = activeRows.map((row) => row.membershipId);
    if (activeIds.length === 0) return { candidate: null, skippedNormalBusy: [] as DispatchRow[] };
    const now = new Date();
    const [records, pendingIntents, makeups] = await Promise.all([
      client.workRecord.findMany({ where: { storeId: board.storeId, employeeMembershipId: { in: activeIds }, deletedAt: null, startAt: { lte: now }, OR: [{ endAt: null }, { endAt: { gt: now } }] }, select: { employeeMembershipId: true } }),
      client.dispatchIntent.findMany({ where: { boardId: board.id, status: "PENDING" }, select: { employeeMembershipId: true } }),
      client.dispatchMakeupTurn.findMany({ where: { boardId: board.id, status: "PENDING" }, orderBy: [{ sequence: "asc" }, { createdAt: "asc" }] }),
    ]);
    const busy = new Set([...records, ...pendingIntents].map((item) => item.employeeMembershipId));
    for (const makeup of makeups) {
      const row = activeRows.find((candidate) => candidate.membershipId === makeup.employeeMembershipId);
      if (row && (!includeAutoBusy || !busy.has(row.membershipId))) return { candidate: { row, makeupId: makeup.id }, skippedNormalBusy: [] as DispatchRow[] };
    }
    const ordered = sortNormalTurnCandidates(activeRows.map((row) => ({ row, membershipId: row.membershipId, normalTurnsProcessed: row.normalTurnsProcessed, position: Number(row.position) })));
    const skippedNormalBusy: DispatchRow[] = [];
    for (const item of ordered) {
      if (includeAutoBusy && busy.has(item.membershipId)) skippedNormalBusy.push(item.row);
      else return { candidate: { row: item.row, makeupId: null }, skippedNormalBusy };
    }
    return { candidate: null, skippedNormalBusy };
  }

  private selectedActiveRow(rows: DispatchRow[], membershipId: string) {
    const row = rows.find((candidate) => candidate.membershipId === membershipId && !candidate.isHidden && candidate.rotationRankedAt);
    if (!row) throw new ConflictException({ code: "DISPATCH_PROVIDER_NOT_ACTIVE", messageZh: "该员工尚未排位或当前已隐藏" });
    return row;
  }

  private async boardWithRows(transaction: Transaction, storeId: string, businessDate: string) {
    const board = await transaction.dailyBoard.findUnique({ where: { storeId_businessDate: { storeId, businessDate: dateAtUtc(businessDate) } }, include: { rows: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], include: { membership: { select: { displayName: true, employmentType: true } } } } } });
    if (!board) throw new NotFoundException({ code: "BOARD_NOT_FOUND", messageZh: "请先添加今天上班的员工" });
    await transaction.$queryRaw`SELECT id FROM daily_boards WHERE id = ${board.id}::uuid FOR UPDATE`;
    return board;
  }

  private async assertOpenEnabled(transaction: Transaction, storeId: string, businessDate: string) {
    await lockBusinessDay(transaction, storeId, businessDate);
    const store = await transaction.store.findFirst({ where: { id: storeId, status: "ACTIVE", deletedAt: null }, select: { automaticDispatchEnabled: true } });
    if (!store) throw new NotFoundException({ code: "STORE_NOT_FOUND", messageZh: "没有找到店铺" });
    if (!store.automaticDispatchEnabled) throw new ConflictException({ code: "AUTOMATIC_DISPATCH_DISABLED", messageZh: "请先在店铺设置中开启自动排工" });
    const closing = await transaction.businessDayClosing.findFirst({ where: { storeId, businessDate: dateAtUtc(businessDate), status: "CLOSED" } });
    if (closing) throw new ConflictException({ code: "BUSINESS_DAY_CLOSED", messageZh: "该营业日已经日结，不能修改排工" });
  }

  private assertVersion(actual: number, expected: number) {
    if (actual !== expected) throw new ConflictException({ code: "BOARD_VERSION_CONFLICT", messageZh: "员工顺序或排工状态已经变化，请刷新后重试", latestResource: { version: actual } });
  }
}
