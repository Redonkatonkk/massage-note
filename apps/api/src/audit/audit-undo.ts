import { ConflictException } from "@nestjs/common";
import { Prisma, type AuditRowChange } from "@massage-note/database";
import { lockBusinessDay } from "../common/business-day-lock.js";

export function supportsLegacyUndo(row: { action: string; source: string; afterJson: Prisma.JsonValue | null }): boolean {
  return row.source !== "data_import_history" && ["work_record.created", "work_record.created_with_custom_service", "work_record.placeholder_created", "work_record.deleted", "work_record.restored"].includes(row.action)
    && !!row.afterJson && typeof row.afterJson === "object" && !Array.isArray(row.afterJson) && Number.isInteger(row.afterJson.version);
}

const tables = new Set([
  "stores", "store_memberships", "store_join_requests", "shifts", "daily_boards", "daily_employee_rows",
  "service_items", "service_item_price_options", "addon_items", "discount_items",
  "employee_default_commissions", "employee_item_commissions", "work_records", "work_record_service_snapshots",
  "work_record_addon_snapshots", "work_record_discount_snapshots", "payment_breakdowns", "gift_card_sales", "lost_customers",
  "business_day_closings", "daily_cash_settlements", "payroll_settlements", "payroll_settlement_confirmations",
  "expense_items", "expense_rule_revisions", "expense_period_overrides", "work_bot_group_bindings",
  "work_bot_member_bindings", "work_bot_aliases", "employee_closing_deliveries", "employee_settlement_deliveries",
]);
const models = new Map(Prisma.dmmf.datamodel.models.filter(model => model.dbName && tables.has(model.dbName)).map(model => [model.dbName!, model]));
type Image = Record<string, unknown>;
interface RowDelegate {
  findUnique(args: object): Promise<Image | null>;
  create(args: object): Promise<unknown>;
  update(args: object): Promise<unknown>;
  delete(args: object): Promise<unknown>;
}
function modelFor(change: AuditRowChange) {
  const model = models.get(change.tableName);
  if (!model) undoConflict("这条记录的数据结构不支持撤销");
  return model;
}
function delegate(tx: Prisma.TransactionClient, change: AuditRowChange): RowDelegate {
  const name = modelFor(change).name;
  return (tx as unknown as Record<string, RowDelegate>)[name[0]!.toLowerCase() + name.slice(1)]!;
}
function key(change: AuditRowChange) { return `${change.tableName}:${change.rowId}`; }
function where(change: AuditRowChange) { return { [modelFor(change).fields.find(field => field.isId)!.name]: change.rowId }; }
function decode(change: AuditRowChange, image: Prisma.JsonValue | null): Image | null {
  if (!image || typeof image !== "object" || Array.isArray(image)) return null;
  return Object.fromEntries(modelFor(change).fields.filter(field => field.kind !== "object").flatMap(field => {
    const value = image[field.dbName ?? field.name];
    if (value === undefined) return [];
    return [[field.name, value === null ? null : field.type === "DateTime" ? new Date(String(value)) : field.type === "BigInt" ? BigInt(String(value)) : field.type === "Decimal" ? new Prisma.Decimal(String(value)) : value]];
  }));
}
function comparable(image: Image | null): string {
  const normalize = (value: unknown): unknown => typeof value === "bigint" ? value.toString() : value instanceof Date ? value.toISOString() : Prisma.Decimal.isDecimal(value) ? value.toFixed() : Array.isArray(value) ? value.map(normalize)
    : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([name, item]) => [name, normalize(item)])) : value;
  return JSON.stringify(normalize(image && Object.fromEntries(Object.entries(image).filter(([name]) => !["version", "updatedAt", "updatedBy"].includes(name)))));
}
export function undoConflict(messageZh: string): never {
  throw new ConflictException({ code: "AUDIT_UNDO_CONFLICT", messageZh });
}

export function unsupportedUndo(actions: string[]): string | null {
  if (actions.some(action => action === "audit.undone")) return "撤销记录用于保留历史，不能再次撤销";
  if (actions.some(action => action === "store.created" || action === "store.deleted" || action === "store.data_imported")) return "店铺创建、删除或覆盖导入请使用店铺恢复与完整备份";
  if (actions.some(action => action.startsWith("closing_delivery.agent_") || action === "membership.account_claimed")) return "账号关联与安全凭证不能恢复为旧状态，请在原设置中调整";
  if (actions.some(action => /\.delivery_(sent|rejected)$/.test(action))) return "已发送或已执行的外部消息无法撤回";
  if (actions.some(action => (action.includes("delivery_") || action.includes("summary_delivery")) && !action.endsWith("delivery_queued"))) return "消息发送任务请在发送队列中取消或重试，已发送的消息无法撤回";
  return null;
}

export async function reverseAuditChanges(tx: Prisma.TransactionClient, storeId: string, actorId: string, changes: AuditRowChange[]) {
  if (!changes.length) undoConflict("这条历史记录缺少完整撤销快照");
  const latest = new Map<string, AuditRowChange>();
  for (const change of changes) latest.set(key(change), change);
  const dates = [...new Set(changes.flatMap(change => [change.beforeJson, change.afterJson].flatMap(image => image && typeof image === "object" && !Array.isArray(image) && typeof image.business_date === "string" ? [image.business_date.slice(0, 10)] : [])))].sort();
  const closingDates = new Set(changes.filter(change => change.tableName === "business_day_closings").flatMap(change => [change.beforeJson, change.afterJson].flatMap(image => image && typeof image === "object" && !Array.isArray(image) && typeof image.business_date === "string" ? [image.business_date.slice(0, 10)] : [])));
  for (const date of dates) {
    await lockBusinessDay(tx, storeId, date);
    if (!closingDates.has(date) && await tx.businessDayClosing.findFirst({ where: { storeId, businessDate: new Date(`${date}T00:00:00Z`), status: "CLOSED" } })) undoConflict("该营业日已经日结，请先取消日结再撤销操作");
  }
  // Business-day locks precede row locks, matching the normal write path.
  const current = new Map<string, Image | null>();
  for (const change of [...latest.values()].sort((a, b) => key(a).localeCompare(key(b)))) {
    const model = modelFor(change);
    const primary = model.fields.find(field => field.isId)!;
    await tx.$queryRawUnsafe(`SELECT "${primary.dbName ?? primary.name}" FROM "${model.dbName}" WHERE "${primary.dbName ?? primary.name}" = $1::uuid FOR UPDATE`, change.rowId);
    const row = await delegate(tx, change).findUnique({ where: where(change) });
    if (comparable(row) !== comparable(decode(change, change.afterJson))) undoConflict("相关数据已发生后续修改，请先撤销后续操作并刷新后重试");
    current.set(key(change), row);
  }
  // Attendance has domain dependencies without SQL foreign keys: removing an
  // unchanged row/shift must not hide work recorded by a later submission.
  const createdRecords = changes.filter(change => change.tableName === "work_records" && change.beforeJson === null).map(change => change.rowId);
  for (const change of latest.values()) {
    if (change.beforeJson !== null || !["daily_boards", "daily_employee_rows", "shifts"].includes(change.tableName)) continue;
    const image = decode(change, change.afterJson);
    if (!image) continue;
    const board = image.boardId ? await tx.dailyBoard.findUnique({ where: { id: String(image.boardId) } }) : null;
    const date = image.businessDate as Date | undefined ?? board?.businessDate;
    if (date && await tx.workRecord.findFirst({ where: {
      storeId, businessDate: date, deletedAt: null, id: { notIn: createdRecords },
      ...(image.membershipId ? { employeeMembershipId: String(image.membershipId) } : {}),
    }, select: { id: true } })) undoConflict("相关数据已有后续引用或修改，请先撤销后续操作并刷新后重试");
  }
  // Restoring a financial confirmation requires the same underlying day data.
  if (changes.some(change => ["business_day_closings", "daily_cash_settlements"].includes(change.tableName))) {
    const undos = await tx.auditUndo.findMany({ where: { storeId } });
    const undoTransactions = await tx.auditLogTransaction.findMany({ where: { auditLogId: { in: undos.map(undo => undo.undoAuditLogId) } } });
    const subsequent = await tx.auditRowChange.findFirst({ where: {
      storeId, id: { gt: changes.at(-1)!.id },
      transactionId: { notIn: [changes[0]!.transactionId, ...undos.map(undo => undo.transactionId), ...undoTransactions.map(row => row.transactionId)] },
      OR: dates.flatMap(date => [{ beforeJson: { path: ["business_date"], equals: date } }, { afterJson: { path: ["business_date"], equals: date } }]),
    } });
    if (subsequent) undoConflict("结算关联的营业日已有后续操作，请先撤销后续操作");
  }
  // Creation is reversed by soft deletion, preserving business snapshots and
  // bot deduplication references. Owned child rows remain with their parent.
  const retained = new Set(changes.filter(change => change.beforeJson === null && current.get(key(change)) && (modelFor(change).fields.some(field => field.name === "deletedAt") || ["business_day_closings", "employee_closing_deliveries", "employee_settlement_deliveries"].includes(change.tableName))).map(key));
  let changed = true;
  while (changed) {
    changed = false;
    for (const change of changes) {
      if (retained.has(key(change))) continue;
      if (!["service_item_price_options", "work_record_service_snapshots", "work_record_addon_snapshots", "work_record_discount_snapshots", "payment_breakdowns", "payroll_settlement_confirmations", "expense_rule_revisions", "expense_period_overrides", "employee_default_commissions", "employee_item_commissions"].includes(change.tableName)) continue;
      const image = decode(change, change.afterJson);
      if (!image) continue;
      for (const relation of modelFor(change).fields.filter(field => field.kind === "object" && field.relationFromFields?.length === 1)) {
        const parent = [...models.values()].find(model => model.name === relation.type);
        if (parent && retained.has(`${parent.dbName}:${String(image[relation.relationFromFields![0]!])}`)) { retained.add(key(change)); changed = true; }
      }
    }
  }
  const softened = new Set<string>();
  for (const change of [...changes].reverse()) {
    const model = modelFor(change);
    const row = current.get(key(change));
    if (retained.has(key(change))) {
      if (softened.has(key(change))) continue;
      if (change.tableName === "daily_cash_settlements") {
        softened.add(key(change));
        await tx.dailyCashSettlement.update({ where: { id: change.rowId }, data: { status: "UNSETTLED", settledAt: null, settledBy: null, version: { increment: 1 } } });
        continue;
      }
      if (change.tableName === "store_memberships") {
        softened.add(key(change));
        await tx.storeMembership.update({ where: { id: change.rowId }, data: { status: "INACTIVE", leftAt: new Date(), deletedBy: actorId, deleteReason: "撤销新增操作", version: { increment: 1 } } });
        continue;
      }
      if (change.tableName === "business_day_closings") {
        softened.add(key(change));
        await tx.businessDayClosing.update({ where: { id: change.rowId }, data: { status: "CANCELLED", cancelledBy: actorId, cancelledAt: new Date(), version: { increment: 1 } } });
        continue;
      }
      if (["employee_closing_deliveries", "employee_settlement_deliveries"].includes(change.tableName)) {
        softened.add(key(change));
        await delegate(tx, change).update({ where: where(change), data: { status: "CANCELLED" } });
        continue;
      }
      if (!model.fields.some(field => field.name === "deletedAt")) continue;
      softened.add(key(change));
      const names = new Set(model.fields.map(field => field.name));
      await delegate(tx, change).update({ where: where(change), data: {
        deletedAt: new Date(), ...(names.has("deletedBy") ? { deletedBy: actorId } : {}),
        ...(names.has("deleteReason") ? { deleteReason: "撤销新增操作" } : {}),
        ...(names.has("version") ? { version: { increment: 1 } } : {}),
        ...(names.has("updatedBy") ? { updatedBy: actorId } : {}),
      } });
      continue;
    }
    const before = decode(change, change.beforeJson);
    if (before === null) { await delegate(tx, change).delete({ where: where(change) }); continue; }
    const data = { ...before };
    if ("version" in data) data.version = Number(row?.version ?? data.version) + 1;
    if ("updatedAt" in data) data.updatedAt = new Date();
    if ("updatedBy" in data) data.updatedBy = actorId;
    if (model.name === "Store" && row) data.nextGiftCardSerialNumber = Math.max(Number(row.nextGiftCardSerialNumber), Number(data.nextGiftCardSerialNumber));
    // Nullable JSON fields need Prisma's explicit database-null sentinel.
    for (const field of model.fields) if (field.type === "Json" && data[field.name] === null) data[field.name] = Prisma.DbNull;
    if (change.afterJson === null) await delegate(tx, change).create({ data });
    else {
      delete data[model.fields.find(field => field.isId)!.name];
      await delegate(tx, change).update({ where: where(change), data });
    }
    current.set(key(change), { ...data, ...where(change) });
  }
}
