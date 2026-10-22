import { z } from "zod";
import { uuidSchema } from "./common.js";

export const STORE_BACKUP_MAX_BYTES = 50 * 1024 * 1024;
export const storeBackupModeSchema = z.enum(["full", "anonymized"]);
export const storeBackupTables = [
  "storeMembership", "serviceItem", "serviceItemPriceOption", "addonItem", "discountItem",
  "employeeDefaultCommission", "employeeItemCommission", "shift", "dailyBoard", "dailyEmployeeRow",
  "workRecord", "workRecordServiceSnapshot", "workRecordAddonSnapshot", "workRecordDiscountSnapshot",
  "paymentBreakdown", "giftCardSale", "lostCustomer", "businessDayClosing", "dailyCashSettlement",
  "payrollSettlement", "payrollSettlementConfirmation", "expenseItem", "expenseRuleRevision",
  "expensePeriodOverride", "workBotAlias", "auditLog",
] as const;
export type StoreBackupTable = typeof storeBackupTables[number];
export const backupRowSchema = z.record(z.string(), z.json());
export type BackupRow = z.infer<typeof backupRowSchema>;
const backupShape = z.strictObject({
  format: z.literal("massage-note-store"),
  formatVersion: z.literal(1),
  appVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  mode: storeBackupModeSchema,
  exportedAt: z.iso.datetime(),
  source: z.strictObject({ storeName: z.string(), storeCode: z.string().regex(/^\d{6}$/), dateFrom: z.iso.date().nullable(), dateTo: z.iso.date().nullable() }),
  data: z.strictObject({ store: backupRowSchema, tables: z.record(z.enum(storeBackupTables), z.array(backupRowSchema)) }),
  checksum: z.string().regex(/^[a-f0-9]{64}$/),
});
// Check nesting before Zod traverses recursive historical JSON, on both clients.
export const storeBackupSchema = z.unknown().transform((input, ctx) => {
  const stack: Array<[unknown, number]> = [[input, 0]];
  while (stack.length) {
    const [value, depth] = stack.pop()!;
    if (depth > 50) { ctx.addIssue({ code: "custom", message: "数据文件嵌套层级过深" }); return z.NEVER; }
    if (value && typeof value === "object") for (const entry of Object.values(value)) stack.push([entry, depth + 1]);
  }
  return input;
}).pipe(backupShape);
export type StoreBackup = z.infer<typeof storeBackupSchema>;
export type StoreBackupMode = z.infer<typeof storeBackupModeSchema>;
export const storeImportPreviewSchema = z.strictObject({ backup: storeBackupSchema });
export const storeImportConfirmSchema = z.strictObject({ backup: storeBackupSchema, previewId: uuidSchema, confirmName: z.string().min(1).max(200) });
export interface StoreImportPreview {
  previewId: string;
  expiresAt: string;
  targetName: string;
  targetFingerprint: string;
  source: StoreBackup["source"];
  mode: StoreBackupMode;
  counts: Record<StoreBackupTable, number>;
}
