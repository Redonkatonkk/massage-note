import { createHash, randomUUID } from "node:crypto";
import { BadRequestException } from "@nestjs/common";
import { Prisma } from "@massage-note/database";
import { storeBackupSchema, storeBackupTables, weeklyDispatchSchema, STORE_BACKUP_MAX_BYTES, type BackupRow, type StoreBackup, type StoreBackupTable } from "@massage-note/contracts";

export const backupModels = new Map(Prisma.dmmf.datamodel.models.map(model => [model.name[0]!.toLowerCase() + model.name.slice(1), model]));
export const childScopes: Partial<Record<StoreBackupTable, object>> = {
  serviceItemPriceOption: { serviceItem: {} },
  workRecordServiceSnapshot: { workRecord: {} }, workRecordAddonSnapshot: { workRecord: {} },
  workRecordDiscountSnapshot: { workRecord: {} }, paymentBreakdown: { workRecord: {} },
  payrollSettlementConfirmation: { payrollSettlement: {} }, expenseRuleRevision: { item: {} },
  expensePeriodOverride: { rule: { item: {} } },
};
export function tableScope(table: StoreBackupTable, storeId: string): object {
  if (table === "expensePeriodOverride") return { rule: { item: { storeId } } };
  const scope = childScopes[table];
  return scope ? { [Object.keys(scope)[0]!]: { storeId } } : { storeId };
}
export interface BackupDelegate {
  findMany(args: object): Promise<unknown[]>;
  createMany(args: object): Promise<unknown>;
  deleteMany(args: object): Promise<unknown>;
}
export function delegate(tx: Prisma.TransactionClient, table: StoreBackupTable): BackupDelegate {
  return (tx as unknown as Record<string, BackupDelegate>)[table]!;
}
export function jsonValue(value: unknown): BackupRow[string] {
  if (value === null || value === undefined) return null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonValue);
  if (typeof value === "object") {
    if (Prisma.Decimal.isDecimal(value)) return value.toFixed();
    if ("toJSON" in value && typeof value.toJSON === "function") return jsonValue(value.toJSON());
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, jsonValue(entry)]));
  }
  if (typeof value === "string" || typeof value === "boolean" || typeof value === "number") return value;
  throw new Error("Unsupported backup value");
}
export function canonicalJson(value: unknown): string {
  const sort = (item: unknown): unknown => Array.isArray(item) ? item.map(sort)
    : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, entry]) => [key, sort(entry)])) : item;
  return JSON.stringify(sort(value));
}
export function checksum(value: unknown): string { return createHash("sha256").update(canonicalJson(value)).digest("hex"); }
export function sealBackup(backup: Omit<StoreBackup, "checksum"> | StoreBackup): StoreBackup {
  const content = Object.fromEntries(Object.entries(backup).filter(([key]) => key !== "checksum")) as Omit<StoreBackup, "checksum">;
  return { ...content, checksum: checksum(content) };
}
export function invalidBackup(detail: string): never {
  throw new BadRequestException({ code: "STORE_BACKUP_INVALID", message: `数据文件校验失败：${detail}`, messageZh: `数据文件校验失败：${detail}` });
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = /^\d{4}-\d\d-\d\d(?:T\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d))?$/;
function checkDepth(value: unknown, depth = 0): void {
  if (depth > 50) invalidBackup("嵌套层级过深");
  if (value && typeof value === "object") for (const entry of Object.values(value)) checkDepth(entry, depth + 1);
}
export function validateBackup(input: unknown): StoreBackup {
  checkDepth(input);
  if (Buffer.byteLength(JSON.stringify(input)) > STORE_BACKUP_MAX_BYTES) invalidBackup("文件超过 50 MiB");
  const parsed = storeBackupSchema.safeParse(input);
  if (!parsed.success) invalidBackup("格式或备份版本不受支持");
  const { checksum: expected, ...content } = parsed.data;
  if (checksum(content) !== expected) invalidBackup("校验值不匹配");
  const backup = parsed.data;
  const datasets: Array<[string, BackupRow[]]> = [["store", [backup.data.store]], ...storeBackupTables.map(table => [table, backup.data.tables[table]] as [string, BackupRow[]])];
  const rowIds = new Map<string, Set<string>>();
  for (const [table, rows] of datasets) {
    const model = backupModels.get(table)!;
    const fields = model.fields.filter(field => field.kind !== "object");
    const ids = new Set<string>();
    rowIds.set(model.name, ids);
    for (const row of rows) {
      // Backups created before earnings-type selection cover both types.
      if (table === "payrollSettlement" && !("amountType" in row)) {
        row.amountType = "ALL";
      }
      if (table === "payrollSettlement" && !["SERVICE", "TIP", "ALL"].includes(String(row.amountType))) invalidBackup(`${table}.amountType 无效`);
      if (Object.keys(row).length !== fields.length || fields.some(field => !(field.name in row))) invalidBackup(`${table} 字段不完整或包含未知字段`);
      for (const field of fields) {
        const value = row[field.name];
        if (value === null) { if (field.isRequired && field.type !== "Json") invalidBackup(`${table}.${field.name} 不能为空`); continue; }
        let valid = false;
        if (field.type === "Json") valid = true;
        else if (field.kind === "enum") valid = typeof value === "string" && !!Prisma.dmmf.datamodel.enums.find(item => item.name === field.type)?.values.some(item => item.name === value);
        else if (field.type === "String") valid = typeof value === "string" && (!field.nativeType || field.nativeType[0] !== "Uuid" || uuid.test(value));
        else if (field.type === "Boolean") valid = typeof value === "boolean";
        else if (field.type === "Int") valid = typeof value === "number" && Number.isInteger(value) && value >= -2147483648 && value <= 2147483647;
        else if (field.type === "BigInt") valid = typeof value === "string" && value.length <= 20 && /^-?\d+$/.test(value) && BigInt(value) >= -(2n ** 63n) && BigInt(value) < 2n ** 63n;
        else if (field.type === "Decimal") {
          if (typeof value === "string" && /^-?\d+(?:\.\d+)?$/.test(value)) {
            const [integer = "", fraction = ""] = value.replace(/^-/, "").split(".");
            const precision = Number(field.nativeType?.[1]?.[0] ?? 20);
            const scale = Number(field.nativeType?.[1]?.[1] ?? 10);
            valid = integer.replace(/^0+/, "").length <= precision - scale && fraction.length <= scale;
          }
        }
        else if (field.type === "DateTime") valid = typeof value === "string" && iso.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
        if (!valid) invalidBackup(`${table}.${field.name} 类型不正确`);
      }
      const id = String(row.id ?? row.payrollSettlementId);
      if (!uuid.test(id) || ids.has(id)) invalidBackup(`${table} 编号重复或无效`);
      ids.add(id);
      if (table !== "store" && "storeId" in row && row.storeId !== backup.data.store.id) invalidBackup("包含其他店铺的数据");
    }
  }
  for (const [table, rows] of datasets) {
    const relations = backupModels.get(table)!.fields.filter(field => field.kind === "object" && field.relationFromFields?.length);
    for (const row of rows) for (const relation of relations) {
      const ids = rowIds.get(relation.type);
      const field = relation.relationFromFields![0]!;
      if (ids && row[field] !== null && !ids.has(String(row[field]))) invalidBackup(`${table}.${field} 引用不存在`);
    }
  }
  const owner = backup.data.tables.storeMembership.find(row => row.id === backup.data.store.ownerMembershipId);
  if (!owner || owner.role !== "OWNER" || owner.status !== "ACTIVE" || owner.deletedAt !== null || backup.data.tables.storeMembership.filter(row => row.role === "OWNER" && row.status === "ACTIVE" && row.deletedAt === null).length !== 1) invalidBackup("必须包含唯一的在职店长档案");
  for (const row of backup.data.tables.employeeItemCommission) {
    const model = row.itemType === "SERVICE" ? "ServiceItem" : "AddonItem";
    if (!rowIds.get(model)!.has(String(row.itemId))) invalidBackup("员工项目提成引用不存在");
  }
  if (backup.data.store.weeklyDispatchJson !== null) {
    const schedule = weeklyDispatchSchema.safeParse(backup.data.store.weeklyDispatchJson);
    if (!schedule.success || Object.values(schedule.data).flat().some(id => !rowIds.get("StoreMembership")!.has(id))) invalidBackup("每周排班引用不存在或结构无效");
  }
  try { new Intl.DateTimeFormat("en", { timeZone: String(backup.data.store.timezone) }); } catch { invalidBackup("店铺时区无效"); }
  if (backup.source.storeName !== backup.data.store.name || backup.source.storeCode !== backup.data.store.storeCode) invalidBackup("来源摘要不一致");
  return sealBackup(backup);
}

const auditActions = new Set(["ai.preview_consumed", "board.row_added", "board.row_hidden", "board.row_removed", "board.row_shown", "board.row_updated", "board.rows_ranked", "board.rows_reordered", "board.weekly_dispatch_applied", "board.weekly_dispatch_updated", "business_day.closed", "business_day.closing_cancelled", "business_day.force_closed", "cash_settlement.reopened", "cash_settlement.reopened_automatically", "cash_settlement.settled", "cash_settlement.settled_via_all", "catalog.initialized", "catalog.item_created", "catalog.item_deleted", "catalog.item_restored", "catalog.item_updated", "catalog.items_reordered", "closing_delivery.agent_credential_revoked", "closing_delivery.agent_credential_rotated", "commission.employee_default_changed", "commission.employee_item_changed", "employee_closing.delivery_cancelled", "employee_closing.delivery_queued", "employee_closing.delivery_rejected", "employee_closing.delivery_sent", "employee_settlement.delivery_cancelled", "employee_settlement.delivery_detail_retried", "employee_settlement.delivery_queued", "employee_settlement.delivery_retried", "employee_settlement.delivery_sent", "expense.created", "expense.deleted", "expense.period_cleared", "expense.period_recorded", "expense.restored", "expense.rule_changed", "expense.stopped", "expense.updated", "finance.employee_summary_delivery_queued", "gift_card.sale_created", "gift_card.sale_deleted", "gift_card.sale_restored", "gift_card.sale_updated", "lost_customer.created", "lost_customer.deleted", "lost_customer.updated", "membership.account_claimed", "membership.created_unclaimed", "membership.deactivated", "membership.join_approved", "membership.join_approved_and_restored", "membership.join_rejected", "membership.join_requested", "membership.restored", "membership.updated", "payroll_settlement.confirmed", "payroll_settlement.created", "payroll_settlement.deleted", "payroll_settlement.restored", "payroll_settlement.updated", "shift.clocked_in", "shift.clocked_out", "shift.stale_auto_closed", "store.created", "store.data_imported", "store.deleted", "store.owner_transferred", "store.settings_updated", "work_bot.alias_created", "work_bot.alias_deleted", "work_bot.alias_updated", "work_bot.create", "work_bot.delete", "work_bot.group_bound", "work_bot.group_unbound", "work_bot.instructions_updated", "work_bot.member_bound", "work_bot.member_unbound", "work_bot.member_verified", "work_bot.update", "work_bot.work_adjusted", "work_bot.work_finished", "work_bot.work_started", "work_record.commission_refreshed", "work_record.created", "work_record.created_with_custom_service", "work_record.deleted", "work_record.payment_confirmed", "work_record.placeholder_created", "work_record.restored", "work_record.updated"]);
const nameFields = new Set(["name", "fullName", "shortName", "displayName", "displayNameNormalized", "employeeName", "storeName", "serviceName", "serviceShortName", "alias", "aliasNormalized"]);
const textFields = /note|reason|instructions|message|error|rawText|reply|firstName|lastName/i;
const containers = new Set(["ties", "store", "employee", "employees", "records", "addons", "discounts", "services", "items", "rows", "entries", "summary", "totals", "warnings", "payment", "payments", "schedule", "beforeOrder", "afterOrder", "before", "after", "members", "rules", "periods", "snapshot", "cash", "card", "giftCard", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday", "0", "1", "2", "3", "4", "5", "6"]);
const enumValues = new Set(["MANAGER_OVERRIDE", "ai", "messages_agent", "BUDGET", "EMPLOYMENT_TYPE", "RECENT_ATTENDANCE", "STABLE_ID", "ONCE", "RECURRING", "api", "web", "WEB", "API", "langbot", "system", "scheduler", "import", "data_import_history", "OWNER", "MANAGER", "EMPLOYEE", "ACTIVE", "INACTIVE", "DELETED", "SETUP", "FULL_TIME", "PART_TIME", "PENDING_PAYMENT", "CONFIRMED", "PLACEHOLDER", "CLOSED", "CANCELLED", "SETTLED", "UNSETTLED", "SERVICE", "ADDON", "DISCOUNT", "CASH", "CARD", "GIFT_CARD", "NON_CASH", "ALL", "MIXED", "OTHER", "CHECK", "ZELLE", "VENMO", "cash", "card", "gift", "unknown", "zero", "zh_CN", "en_US", "DAY", "WEEK", "MONTH", "YEAR", "FIXED", "VARIABLE", "DAILY", "WEEKLY", "MONTHLY", "YEARLY", "day", "week", "month", "year", "fixed", "variable", "NONE", "DEFAULT", "GLOBAL", "EMPLOYEE_DEFAULT", "EMPLOYEE_ITEM", "ITEM_DEFAULT", "MANUAL", "STORE_DEFAULT", "employee_default", "employee_item", "item_default", "store_default", "manual"]);

/** Construct a copy with a closed string policy, including nested historical JSON. */
export function anonymizeBackup(backup: StoreBackup): StoreBackup {
  const ids = new Map<string, string>();
  const labels = new Map<string, string>();
  const rawNames = new Map<string, string>();
  const giftCards = new Map<string, string>();
  const mapId = (value: string) => {
    const key = uuid.test(value) ? value.toLowerCase() : value;
    if (!ids.has(key)) ids.set(key, randomUUID());
    return ids.get(key)!;
  };
  for (const [index, row] of backup.data.tables.storeMembership.entries()) {
    labels.set(String(row.id), `演示员工 ${String(index + 1).padStart(2, "0")}`);
    rawNames.set(String(row.displayName), labels.get(String(row.id))!);
  }
  labels.set(String(backup.data.store.id), "演示店铺"); rawNames.set(String(backup.data.store.name), "演示店铺");
  for (const table of ["serviceItem", "addonItem", "discountItem", "expenseItem", "workBotAlias"] as const) {
    for (const [index, row] of backup.data.tables[table].entries()) {
      const prefix = { serviceItem: "演示项目", addonItem: "演示加项", discountItem: "演示优惠", expenseItem: "演示支出", workBotAlias: "演示别名" }[table];
      const label = `${prefix} ${String(index + 1).padStart(2, "0")}`;
      labels.set(String(row.id), label);
      for (const key of nameFields) if (typeof row[key] === "string" && row[key] && !rawNames.has(row[key] as string)) rawNames.set(row[key] as string, label);
    }
  }
  const demoName = (value: string, context: BackupRow) => {
    const reference = context.membershipId ?? context.employeeMembershipId ?? context.sourceServiceItemId ?? context.sourceAddonItemId ?? context.sourceDiscountItemId ?? context.id;
    const label = labels.get(String(reference)) ?? rawNames.get(value);
    if (label) return label;
    if (!rawNames.has(value)) rawNames.set(value, `演示对象 ${rawNames.size + 1}`);
    return rawNames.get(value)!;
  };
  const walk = (value: BackupRow[string], key: string, context: BackupRow, historical: boolean, depth = 0): BackupRow[string] | undefined => {
    if (depth > 50) invalidBackup("无法安全处理历史快照");
    if (/phone/i.test(key)) return null;
    if (value === null) return null;
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (textFields.test(key)) return typeof value === "string" ? (value ? "演示说明" : "") : null;
    if (Array.isArray(value)) return value.map(entry => walk(entry, key, context, historical, depth + 1)).filter((entry): entry is BackupRow[string] => entry !== undefined);
    if (typeof value === "object") {
      const result: BackupRow = {};
      for (const [childKey, entry] of Object.entries(value)) {
        const known = !historical || containers.has(childKey) || nameFields.has(childKey) || /(?:Id|Ids|Cents|Bps|Count|Minutes|At|Date|From|To)$/.test(childKey) || /^(?:is[A-Z]|has[A-Z]|.*Enabled$)/.test(childKey) || ["id", "role", "status", "source", "action", "entityType", "kind", "unit", "interval", "position", "version", "cycleNo", "schemaVersion", "commissionSource", "paymentMethod", "paymentScope", "serialNumber", "serialNumberNormalized", "giftCardSerialNumber", "timezone", "businessCutoffLocal", "durationMinutes", "amountMode", "code", "severity", "level", "rank", "previousPosition", "newPosition", "employmentType", "lastPosition", "generatedPosition", "ahead", "rule"].includes(childKey) || textFields.test(childKey) || /phone/i.test(childKey);
        if (!known) continue;
        const entryValue = walk(entry, childKey, value, historical, depth + 1);
        if (entryValue !== undefined) result[childKey] = entryValue;
      }
      return result;
    }
    if (typeof value !== "string") return value;
    if (nameFields.has(key)) return demoName(value, context).normalize("NFKC").toLowerCase();
    if (/phone/i.test(key)) return null;
    if (key === "storeCode") return "000000";
    if (key === "requestId") return mapId(value);
    if (key === "idempotencyKeyHash") return null;
    if (/serialNumber|giftCardSerialNumber/i.test(key)) {
      const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ").toUpperCase();
      if (!giftCards.has(normalized)) giftCards.set(normalized, `DEMO-${String(giftCards.size + 1).padStart(6, "0")}`);
      return giftCards.get(normalized)!;
    }
    if (uuid.test(value)) return mapId(value);
    if (iso.test(value) && Number.isFinite(Date.parse(value))) return value;
    if (/Cents|Bps|position/i.test(key) && /^-?\d+(?:\.\d+)?$/.test(value)) return value;
    if (key === "timezone" || key === "storeTimezoneSnapshot") { try { new Intl.DateTimeFormat("en", { timeZone: value }); return value; } catch { invalidBackup("无法安全处理时区"); } }
    if (/Cutoff|occurredTime/.test(key) && /^\d\d:\d\d$/.test(value)) return value;
    if (key === "action") return auditActions.has(value) ? value : "historical.change";
    if (key === "entityType") return [...backupModels.values()].some(model => model.dbName?.replace(/s$/, "") === value) ? value : "historical_record";
    if (enumValues.has(value)) return value;
    if (historical) return undefined;
    invalidBackup(`无法安全处理字段 ${key}`);
  };
  const transform = (row: BackupRow, table: string): BackupRow => {
    const result: BackupRow = {};
    const model = backupModels.get(table)!;
    for (const field of model.fields.filter(field => field.kind !== "object")) {
      const value = row[field.name]!;
      if (field.kind === "enum" || field.type === "DateTime" || field.type === "BigInt" || field.type === "Decimal") result[field.name] = value;
      else if (field.name === "nextGiftCardSerialNumber") result[field.name] = 1001;
      else result[field.name] = walk(value, field.name, row, field.type === "Json") ?? null;
    }
    return result;
  };
  const tables = Object.fromEntries(storeBackupTables.map(table => [table, backup.data.tables[table].map(row => transform(row, table))])) as StoreBackup["data"]["tables"];
  const store = transform(backup.data.store, "store");
  return sealBackup({ ...backup, mode: "anonymized", source: { ...backup.source, storeName: String(store.name), storeCode: String(store.storeCode) }, data: { store, tables } });
}

export function decodeRow(table: string, row: BackupRow): Record<string, unknown> {
  return Object.fromEntries(backupModels.get(table)!.fields.filter(field => field.kind !== "object").map(field => {
    const value = row[field.name];
    return [field.name, value === null ? (field.type === "Json" ? Prisma.DbNull : null) : field.type === "BigInt" ? BigInt(value as string) : field.type === "DateTime" ? new Date(value as string) : value];
  }));
}

export function remapBackupData(backup: StoreBackup, targetStoreId: string, ownerMembershipId: string): StoreBackup["data"] {
  const ids = new Map<string, string>([[String(backup.data.store.id), targetStoreId], [String(backup.data.store.ownerMembershipId), ownerMembershipId]]);
  const map = (value: BackupRow[string], key = "", arrayReference = false): BackupRow[string] => {
    const reference = key === "id" || /(?:Id|Ids|By)$/.test(key) || arrayReference;
    if (typeof value === "string" && uuid.test(value) && reference && !textFields.test(key) && !nameFields.has(key)) { if (!ids.has(value)) ids.set(value, randomUUID()); return ids.get(value)!; }
    if (Array.isArray(value)) return value.map(entry => map(entry, key, true));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, entry]) => [childKey, map(entry, childKey)]));
    return value;
  };
  return map(backup.data as unknown as BackupRow) as StoreBackup["data"];
}
