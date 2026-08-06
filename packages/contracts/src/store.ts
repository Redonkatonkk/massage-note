import { z } from "zod";
import { commissionBpsSchema, versionSchema } from "./common.js";

export const storeCodeSchema = z
  .string()
  .regex(/^\d{6}$/, "店铺代码必须是 6 位数字");

export const timezoneSchema = z
  .string()
  .trim()
  .min(1, "请选择店铺时区")
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("zh-CN", { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }, "店铺时区无效");

export const businessCutoffSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "营业日截止时间必须使用 HH:mm 格式");

export const createStoreSchema = z.object({
  storeCode: storeCodeSchema,
  name: z.string().trim().min(1, "店铺名称不能为空").max(100),
  timezone: timezoneSchema,
  businessCutoffLocal: businessCutoffSchema.default("22:00"),
  globalCommissionBps: commissionBpsSchema,
});

export const createJoinRequestSchema = z.object({
  displayName: z.string().trim().min(1, "店内显示名称不能为空").max(80),
});

export const updateStoreSchema = z
  .object({
    version: versionSchema,
    name: z.string().trim().min(1, "店铺名称不能为空").max(100).optional(),
    timezone: timezoneSchema.optional(),
    businessCutoffLocal: businessCutoffSchema.optional(),
    globalCommissionBps: commissionBpsSchema.optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.timezone !== undefined ||
      value.businessCutoffLocal !== undefined ||
      value.globalCommissionBps !== undefined,
    "至少需要修改一个店铺字段",
  );

export const deleteStoreSchema = z.object({
  version: versionSchema,
  reason: z.string().trim().min(1, "请填写删除店铺的原因").max(500),
});

export const transferOwnerSchema = z.object({
  version: versionSchema,
  newOwnerMembershipId: z.uuid(),
});

const assignableRoleSchema = z.enum(["MANAGER", "EMPLOYEE"], {
  message: "成员角色只能是经理或员工",
});

export const approveJoinRequestSchema = z.object({
  version: versionSchema,
  role: assignableRoleSchema.default("EMPLOYEE"),
  isServiceProvider: z.boolean().default(true),
});

export const rejectJoinRequestSchema = z.object({
  version: versionSchema,
  reviewNote: z.string().trim().max(500, "审核备注不能超过 500 个字").optional(),
});

export const updateMembershipSchema = z
  .object({
    version: versionSchema,
    displayName: z.string().trim().min(1, "店内显示名称不能为空").max(80).optional(),
    role: assignableRoleSchema.optional(),
    isServiceProvider: z.boolean().optional(),
    defaultCommissionBps: commissionBpsSchema.nullable().optional(),
  })
  .refine(
    (value) =>
      value.displayName !== undefined ||
      value.role !== undefined ||
      value.isServiceProvider !== undefined ||
      value.defaultCommissionBps !== undefined,
    "至少需要修改一个成员字段",
  );

export const deactivateMembershipSchema = z.object({
  version: versionSchema,
  reason: z.string().trim().min(1, "请填写离职或停用原因").max(500),
});

export const restoreMembershipSchema = z.object({
  version: versionSchema,
  displayName: z.string().trim().min(1, "店内显示名称不能为空").max(80).optional(),
  role: assignableRoleSchema.optional(),
  isServiceProvider: z.boolean().optional(),
});

export type CreateStoreInput = z.input<typeof createStoreSchema>;
export type CreateStore = z.output<typeof createStoreSchema>;
export type CreateJoinRequestInput = z.input<typeof createJoinRequestSchema>;
export type UpdateStoreInput = z.input<typeof updateStoreSchema>;
export type DeleteStoreInput = z.input<typeof deleteStoreSchema>;
export type TransferOwnerInput = z.input<typeof transferOwnerSchema>;
export type ApproveJoinRequestInput = z.input<typeof approveJoinRequestSchema>;
export type ApproveJoinRequest = z.output<typeof approveJoinRequestSchema>;
export type RejectJoinRequestInput = z.input<typeof rejectJoinRequestSchema>;
export type UpdateMembershipInput = z.input<typeof updateMembershipSchema>;
export type DeactivateMembershipInput = z.input<typeof deactivateMembershipSchema>;
export type RestoreMembershipInput = z.input<typeof restoreMembershipSchema>;
