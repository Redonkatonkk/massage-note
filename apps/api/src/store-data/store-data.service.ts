import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { ConflictException, ForbiddenException, Injectable } from "@nestjs/common";
import { Prisma, type User } from "@massage-note/database";
import { storeBackupTables, type BackupRow, type StoreBackup, type StoreBackupMode, type StoreImportPreview } from "@massage-note/contracts";
import { PrismaService } from "../database/prisma.service.js";
import { StoreAccessService } from "../stores/store-access.service.js";
import { anonymizeBackup, backupModels, checksum, decodeRow, delegate, invalidBackup, jsonValue, remapBackupData, sealBackup, tableScope, validateBackup } from "./store-backup.js";

function conflict(code: string, messageZh: string): never { throw new ConflictException({ code, messageZh }); }
const ttl = 10 * 60 * 1000;
const appVersion = (JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as { version: string }).version;

@Injectable()
export class StoreDataService {
  constructor(private readonly prisma: PrismaService, private readonly access: StoreAccessService) {}

  private async owner(actor: User, storeId: string, tx: Prisma.TransactionClient = this.prisma) {
    const membership = await this.access.requireActiveMembership(actor.id, storeId, tx);
    if (membership.role !== "OWNER") throw new ForbiddenException({ code: "STORE_DATA_OWNER_REQUIRED", messageZh: "只有店长可以导入或导出店铺数据" });
    return membership;
  }

  async capture(tx: Prisma.TransactionClient, storeId: string): Promise<StoreBackup["data"]> {
    const store = await tx.store.findUniqueOrThrow({ where: { id: storeId } });
    const tables = {} as StoreBackup["data"]["tables"];
    // A stable order makes fingerprints independent of query plans and insertion order.
    for (const table of storeBackupTables) {
      const orderBy = table === "payrollSettlementConfirmation" ? { payrollSettlementId: "asc" } : { id: "asc" };
      tables[table] = jsonValue(await delegate(tx, table).findMany({ where: tableScope(table, storeId), orderBy })) as BackupRow[];
    }
    return { store: jsonValue(store) as BackupRow, tables };
  }

  private makeBackup(data: StoreBackup["data"], mode: StoreBackupMode): StoreBackup {
    const dates = storeBackupTables.flatMap(table => data.tables[table].flatMap(row => typeof row.businessDate === "string" ? [row.businessDate.slice(0, 10)] : [])).sort();
    const full = sealBackup({ format: "massage-note-store", formatVersion: 1, appVersion, mode: "full", exportedAt: new Date().toISOString(), source: { storeName: String(data.store.name), storeCode: String(data.store.storeCode), dateFrom: dates[0] ?? null, dateTo: dates.at(-1) ?? null }, data });
    const backup = mode === "anonymized" ? anonymizeBackup(full) : full;
    return validateBackup(backup);
  }

  async export(actor: User, storeId: string, mode: StoreBackupMode, previewId?: string) {
    await this.owner(actor, storeId);
    return this.prisma.$transaction(async tx => {
      await this.owner(actor, storeId, tx);
      const data = await this.capture(tx, storeId);
      if (previewId) {
        if (mode !== "full") invalidBackup("覆盖前备份必须使用完整模式");
        const preview = await tx.storeDataImportPreview.findFirst({ where: { id: previewId, storeId, userId: actor.id } });
        if (!preview || preview.expiresAt.getTime() <= Date.now() || preview.resultJson) conflict("STORE_IMPORT_PREVIEW_EXPIRED", "导入预览已过期，请重新校验文件");
        if (checksum(data) !== preview.targetFingerprint) conflict("STORE_IMPORT_DATA_CHANGED", "店铺数据已变化，请重新校验并下载覆盖前备份");
        await tx.storeDataImportPreview.update({ where: { id: previewId }, data: { recoveryDownloadedAt: new Date() } });
      }
      return this.makeBackup(data, mode);
    }, { isolationLevel: "RepeatableRead", timeout: 60_000 });
  }

  async preview(actor: User, storeId: string, input: unknown): Promise<StoreImportPreview> {
    await this.owner(actor, storeId);
    const backup = validateBackup(input);
    return this.prisma.$transaction(async tx => {
      await this.owner(actor, storeId, tx);
      const current = await this.capture(tx, storeId);
      await tx.storeDataImportPreview.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } } });
      const preview = await tx.storeDataImportPreview.create({ data: { storeId, userId: actor.id, checksum: backup.checksum, targetFingerprint: checksum(current), expiresAt: new Date(Date.now() + ttl) } });
      return { previewId: preview.id, expiresAt: preview.expiresAt.toISOString(), targetName: String(current.store.name), targetFingerprint: preview.targetFingerprint, source: backup.source, mode: backup.mode, counts: Object.fromEntries(storeBackupTables.map(table => [table, backup.data.tables[table].length])) as StoreImportPreview["counts"] };
    }, { isolationLevel: "RepeatableRead", timeout: 60_000 });
  }

  async confirm(actor: User, storeId: string, input: { backup: StoreBackup; previewId: string; confirmName: string }, idempotencyKey: string, requestId: string) {
    await this.owner(actor, storeId);
    const backup = validateBackup(input.backup);
    try {
      return await this.prisma.$transaction(async tx => {
        await tx.$executeRawUnsafe("SET LOCAL lock_timeout = '5s'");
        await tx.$executeRawUnsafe("SET LOCAL statement_timeout = '60s'");
        // Maintenance is rare: fixed table locks also cover schedulers, bots and in-flight writes.
        // Names originate exclusively from the static registry / Prisma metadata, never the file.
        const extra = ["store_join_requests", "employee_closing_deliveries", "employee_settlement_deliveries", "closing_delivery_agents", "work_bot_group_bindings", "work_bot_member_bindings", "work_bot_operations", "ai_change_previews", "idempotency_requests", "store_data_import_previews"];
        const names = [...new Set(["stores", ...storeBackupTables.filter(table => table !== "auditLog").map(table => backupModels.get(table)!.dbName!), ...extra])].sort();
        await tx.$executeRawUnsafe(`LOCK TABLE ${names.map(name => `"${name}"`).join(", ")} IN SHARE ROW EXCLUSIVE MODE`);
        const owner = await this.owner(actor, storeId, tx);
        const preview = await tx.storeDataImportPreview.findFirst({ where: { id: input.previewId, storeId, userId: actor.id } });
        if (!preview || preview.checksum !== backup.checksum) conflict("STORE_IMPORT_PREVIEW_INVALID", "文件与导入预览不一致，请重新校验");
        if (preview.resultJson) {
          if (preview.idempotencyKey !== idempotencyKey || !preview.resultJson || typeof preview.resultJson !== "object" || Array.isArray(preview.resultJson) || preview.resultJson.requestHash !== checksum({ checksum: backup.checksum, confirmName: input.confirmName })) conflict("STORE_IMPORT_ALREADY_COMPLETED", "这次导入已经完成，请刷新页面");
          return preview.resultJson.result;
        }
        if (preview.expiresAt.getTime() <= Date.now()) conflict("STORE_IMPORT_PREVIEW_EXPIRED", "导入预览已过期，请重新校验文件");
        if (!preview.recoveryDownloadedAt) conflict("STORE_IMPORT_RECOVERY_REQUIRED", "请先下载当前店铺的完整备份");
        const current = await this.capture(tx, storeId);
        if (input.confirmName !== current.store.name) invalidBackup("确认店铺名称不匹配");
        if (checksum(current) !== preview.targetFingerprint) conflict("STORE_IMPORT_DATA_CHANGED", "店铺数据已变化，请重新校验并下载覆盖前备份");
        const data = remapBackupData(backup, storeId, owner.id);
        await this.replaceBusinessData(tx, actor, storeId, owner.id, owner.version, current, data, backup);
        await tx.auditLog.create({ data: { storeId, actorUserId: actor.id, actorMembershipId: owner.id, source: "api", action: "store.data_imported", entityType: "store", entityId: storeId, afterJson: { mode: backup.mode, sourceChecksum: backup.checksum, counts: Object.fromEntries(storeBackupTables.map(table => [table, data.tables[table].length])) }, requestId } });
        const result = { imported: true, storeId, mode: backup.mode };
        await tx.storeDataImportPreview.update({ where: { id: preview.id }, data: { idempotencyKey, resultJson: { requestHash: checksum({ checksum: backup.checksum, confirmName: input.confirmName }), result } } });
        return result;
      }, { timeout: 60_000, maxWait: 10_000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (["P2002", "P2003", "P2004", "P2010", "P2028", "P2034"].includes(error.code)) conflict("STORE_IMPORT_FAILED", "导入未完成，原有数据已保留。请检查文件或稍后重新预览");
      }
      if (error instanceof Prisma.PrismaClientUnknownRequestError || error instanceof Prisma.PrismaClientValidationError) conflict("STORE_IMPORT_FAILED", "导入未完成，原有数据已保留。请检查文件或稍后重新预览");
      throw error;
    }
  }

  private async replaceBusinessData(tx: Prisma.TransactionClient, actor: User, storeId: string, ownerId: string, ownerVersion: number, current: StoreBackup["data"], data: StoreBackup["data"], source: StoreBackup) {
    await tx.employeeClosingDelivery.deleteMany({ where: { storeId } });
    await tx.employeeSettlementDelivery.deleteMany({ where: { storeId } });
    await tx.closingDeliveryAgent.updateMany({ where: { storeId }, data: { revokedAt: new Date() } });
    await tx.workBotGroupBinding.deleteMany({ where: { storeId } });
    await tx.aiChangePreview.updateMany({ where: { storeId, status: "PENDING" }, data: { status: "CANCELLED" } });
    await tx.storeJoinRequest.deleteMany({ where: { storeId } });
    await tx.idempotencyRequest.deleteMany({ where: { storeId } });
    for (const table of [...storeBackupTables].reverse()) {
      if (table === "auditLog") continue;
      await delegate(tx, table).deleteMany({ where: table === "storeMembership" ? { storeId, id: { not: ownerId } } : tableScope(table, storeId) });
    }
    const storeFields = decodeRow("store", data.store);
    for (const key of ["id", "storeCode", "ownerMembershipId", "createdAt", "status", "deletedAt", "deletedBy", "deleteReason"]) delete storeFields[key];
    await tx.store.update({ where: { id: storeId }, data: { ...storeFields, version: Number(current.store.version) + 1, workBotInstructionsVersion: Number(current.store.workBotInstructionsVersion) + 1 } });
    for (const table of storeBackupTables) {
      if (table === "auditLog") continue;
      const rows = data.tables[table];
      if (table === "storeMembership") {
        for (const row of rows) { row.userId = row.id === ownerId ? actor.id : null; row.closingDeliveryEnabled = false; }
        const importedOwner = rows.find(row => row.id === ownerId)!;
        const fields = decodeRow(table, importedOwner);
        delete fields.id; fields.version = ownerVersion + 1;
        await tx.storeMembership.update({ where: { id: ownerId }, data: fields });
      }
      const inserts = rows.filter(row => table !== "storeMembership" || row.id !== ownerId).map(row => decodeRow(table, row));
      for (let offset = 0; offset < inserts.length; offset += 100) await delegate(tx, table).createMany({ data: inserts.slice(offset, offset + 100) });
    }
    const existingAudits = new Set(current.tables.auditLog.flatMap(row => [String(row.id), ...(row.originAuditId ? [String(row.originAuditId)] : [])]));
    for (const [index, row] of data.tables.auditLog.entries()) {
      const original = source.data.tables.auditLog[index]!;
      const originAuditId = String(original.originAuditId ?? original.id);
      if (existingAudits.has(originAuditId)) continue;
      existingAudits.add(originAuditId);
      const fields = decodeRow("auditLog", { ...row, id: randomUUID(), originAuditId, source: "data_import_history", actorUserId: null });
      await tx.auditLog.create({ data: fields as unknown as Prisma.AuditLogUncheckedCreateInput });
    }
  }
}
