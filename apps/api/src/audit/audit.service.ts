import { ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, type User } from "@massage-note/database";
import type { AuditLogQuery } from "@massage-note/contracts";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { reverseAuditChanges, supportsLegacyUndo, undoConflict, unsupportedUndo } from "./audit-undo.js";
import { WorkRecordsService } from "../work-records/work-records.service.js";

@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: StoreAccessService,
    private readonly idempotency: IdempotencyService = new IdempotencyService(prisma),
  ) {}

  async undo(actor: User, storeId: string, auditLogId: string, key: string, requestId: string) {
    await this.access.requireCapability(actor.id, storeId, "AUDIT_READ_STORE");
    try {
      return await this.idempotency.execute({ storeId, userId: actor.id, key, route: `audit-logs/${auditLogId}/undo`, payload: { auditLogId }, responseCode: 201, isolationLevel: "Serializable" }, async tx => {
        const manager = await this.access.requireActiveMembership(actor.id, storeId, tx);
        if (manager.role === "EMPLOYEE") throw new ForbiddenException();
        const audit = await tx.auditLog.findFirst({ where: { id: auditLogId, storeId }, include: { undoTransaction: true } });
        if (!audit) throw new NotFoundException({ code: "AUDIT_NOT_FOUND", messageZh: "找不到这条操作记录" });
        const transactionId = audit.undoTransaction?.transactionId ?? (supportsLegacyUndo(audit) ? `legacy:${audit.id}` : null);
        if (!transactionId) throw new ConflictException({ code: "AUDIT_UNDO_UNAVAILABLE", messageZh: "这条历史记录缺少完整撤销快照" });
        const existing = await tx.auditUndo.findUnique({ where: { storeId_transactionId: { storeId, transactionId } } });
        if (existing) return { undone: true, undoAuditLogId: existing.undoAuditLogId };
        const related = audit.undoTransaction ? await tx.auditLog.findMany({ where: { storeId, undoTransaction: { transactionId } } }) : [audit];
        const reason = unsupportedUndo(related.map(row => row.action));
        if (reason) throw new ConflictException({ code: "AUDIT_UNDO_UNAVAILABLE", messageZh: reason });
        const changes = await tx.auditRowChange.findMany({ where: { storeId, transactionId }, orderBy: { id: "asc" } });
        if (manager.role !== "OWNER" && (related.some(row => row.action === "store.owner_transferred") || changes.some(change => change.tableName === "store_memberships" && [change.beforeJson, change.afterJson].some(image => image && typeof image === "object" && !Array.isArray(image) && image.role === "OWNER")))) {
          throw new ForbiddenException({ code: "AUDIT_UNDO_OWNER_REQUIRED", messageZh: "只有店主可以撤销涉及店主身份的操作" });
        }
        // A delivery may already be leased or sent outside this transaction.
        if (changes.some(change => ["employee_closing_deliveries", "employee_settlement_deliveries"].includes(change.tableName) && (change.beforeJson !== null || !change.afterJson || typeof change.afterJson !== "object" || Array.isArray(change.afterJson) || change.afterJson.status !== "QUEUED"))) {
          throw new ConflictException({ code: "AUDIT_UNDO_UNAVAILABLE", messageZh: "消息发送任务请在发送队列中取消或重试，已发送的消息无法撤回" });
        }
        if (audit.undoTransaction) {
          await reverseAuditChanges(tx, storeId, actor.id, changes);
          // Reversal is a new manual scheduling decision. Keep refresh from
          // reapplying the template or generated order that was just undone.
          const weekly = related.some(row => row.action === "board.weekly_dispatch_applied");
          const ordering = related.some(row => ["board.rows_ranked", "board.rows_reordered"].includes(row.action));
          if (weekly || ordering) {
            const boardChanges = changes.filter(change => change.tableName === "daily_boards");
            for (const boardId of new Set(boardChanges.map(change => change.rowId))) {
              let board = await tx.dailyBoard.findUnique({ where: { id: boardId } });
              const image = boardChanges.find(change => change.rowId === boardId && change.afterJson)?.afterJson as { business_date: string; version: number };
              if (!board && weekly) board = await tx.dailyBoard.create({ data: { id: boardId, storeId, businessDate: new Date(image.business_date), version: Math.max(...boardChanges.filter(change => change.rowId === boardId).map(change => (change.afterJson as { version?: number } | null)?.version ?? 0)) + 1 } });
              if (!board) continue;
              if (weekly) board = await tx.dailyBoard.update({ where: { id: boardId }, data: { weeklyDispatchAppliedAt: new Date(), version: { increment: 1 } } });
              const rows = await tx.dailyEmployeeRow.findMany({ where: { boardId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
              await tx.auditLog.create({ data: {
                storeId, actorUserId: actor.id, actorMembershipId: manager.id, source: "api", requestId,
                action: weekly ? "board.weekly_dispatch_applied" : "board.rows_reordered", entityType: "daily_board", entityId: boardId,
                businessDate: board.businessDate, reason: "撤销操作",
                afterJson: { overwritten: weekly, membershipIds: rows.map(row => row.membershipId), managedMembershipIds: rows.map(row => row.membershipId), version: board.version },
              } });
            }
          }
        }
        else {
          const record = await tx.workRecord.findFirst({ where: { id: audit.entityId, storeId } });
          const image = audit.afterJson as { version: number };
          if (!record || record.version !== image.version) undoConflict("相关数据已发生后续修改，请先撤销后续操作并刷新后重试");
          const records = new WorkRecordsService(this.prisma, this.access, this.idempotency);
          if (audit.action === "work_record.deleted") await records.restore(actor, storeId, record.id, { version: record.version }, key, requestId, tx);
          else await records.remove(actor, storeId, record.id, { version: record.version, reason: "撤销操作" }, key, requestId, tx);
        }
        const undone = await tx.auditLog.create({ data: {
          storeId, actorUserId: actor.id, actorMembershipId: manager.id, source: "api", action: "audit.undone",
          entityType: "audit_operation", entityId: audit.id, businessDate: audit.businessDate,
          beforeJson: { auditLogIds: related.map(row => row.id), action: audit.action },
          afterJson: { undone: true }, reason: "撤销操作", requestId,
        } });
        await tx.auditUndo.create({ data: { storeId, transactionId, auditLogId, undoAuditLogId: undone.id } });
        return { undone: true, undoAuditLogId: undone.id };
      });
    } catch (error) {
      if (error instanceof ConflictException && (error.getResponse() as { code?: string }).code === "SETTLEMENT_DATA_CHANGED") undoConflict("相关数据已发生后续修改，请先撤销后续操作并刷新后重试");
      if (error instanceof Prisma.PrismaClientKnownRequestError && (["P2002", "P2003", "P2025"].includes(error.code) || (error.code === "P2010" && ["40001", "40P01", "55P03"].includes(String(error.meta?.code))))) throw new ConflictException({ code: "AUDIT_UNDO_CONFLICT", messageZh: "相关数据已有后续引用或修改，请先撤销后续操作并刷新后重试" });
      throw error;
    }
  }

  async list(actor: User, storeId: string, query: AuditLogQuery) {
    await this.access.requireCapability(actor.id, storeId, "AUDIT_READ_STORE");
    const dateFrom = query.dateFrom ? new Date(`${query.dateFrom}T00:00:00.000Z`) : undefined;
    const dateTo = query.dateTo ? new Date(`${query.dateTo}T00:00:00.000Z`) : undefined;
    const rows = await this.prisma.auditLog.findMany({
      where: {
        storeId,
        ...(query.dateFrom || query.dateTo
          ? {
              businessDate: {
                ...(dateFrom ? { gte: dateFrom } : {}),
                ...(dateTo ? { lte: dateTo } : {}),
              },
            }
          : {}),
        ...(query.action ? { action: query.action } : {}),
        ...(query.entityType ? { entityType: query.entityType } : {}),
        ...(query.actorMembershipId
          ? { actorMembershipId: query.actorMembershipId }
          : {}),
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      include: { undoTransaction: true },
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const actorIds = [...new Set(page.flatMap((row) => row.actorMembershipId ? [row.actorMembershipId] : []))];
    const memberships = actorIds.length
      ? await this.prisma.storeMembership.findMany({
          where: { storeId, id: { in: actorIds } },
          select: { id: true, displayName: true, role: true },
        })
      : [];
    const actorById = new Map(memberships.map((membership) => [membership.id, membership]));
    const transactionIds = [...new Set(page.flatMap(row => row.undoTransaction ? [row.undoTransaction.transactionId] : supportsLegacyUndo(row) ? [`legacy:${row.id}`] : []))];
    const [counts, undos, related] = transactionIds.length ? await Promise.all([
      this.prisma.auditRowChange.groupBy({ by: ["transactionId"], where: { storeId, transactionId: { in: transactionIds } }, _count: true }),
      this.prisma.auditUndo.findMany({ where: { storeId, transactionId: { in: transactionIds } } }),
      this.prisma.auditLog.findMany({ where: { storeId, undoTransaction: { transactionId: { in: transactionIds } } }, select: { action: true, undoTransaction: true } }),
    ]) : [[], [], []];
    const captured = new Set(counts.map(row => row.transactionId));
    const undone = new Set(undos.map(row => row.transactionId));
    return {
      items: page.map(({ undoTransaction, ...row }) => {
        const transactionId = undoTransaction?.transactionId ?? (supportsLegacyUndo(row) ? `legacy:${row.id}` : null);
        const reason = unsupportedUndo([row.action, ...related.filter(item => item.undoTransaction?.transactionId === transactionId).map(item => item.action)])
          ?? (!transactionId || (!captured.has(transactionId) && !supportsLegacyUndo(row)) ? "这条历史记录缺少完整撤销快照" : null);
        return ({
        ...row,
        undo: { available: !reason && !undone.has(transactionId!), undone: undone.has(transactionId!), reason },
        actor: row.actorSnapshotJson && typeof row.actorSnapshotJson === "object" && !Array.isArray(row.actorSnapshotJson) && typeof row.actorSnapshotJson.displayName === "string"
          ? row.actorSnapshotJson
          : row.actorMembershipId ? actorById.get(row.actorMembershipId) ?? null : null,
      }); }),
      nextCursor: hasMore ? page.at(-1)?.id ?? null : null,
    };
  }
}
