import { z } from "zod";
import {
  commissionBpsSchema,
  moneyCentsSchema,
  versionSchema,
} from "./common.js";

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

export const closingImageLocaleSchema = z.enum(["zh_CN", "en_US"]);
export const employmentTypeSchema = z.enum(["FULL_TIME", "PART_TIME"]);
export const optionalE164PhoneSchema = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{7,14}$/, "短信号码必须使用国际格式，例如 +16465551234")
  .nullable();

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
    mondayThursdayAutoDiscountEnabled: z.boolean().optional(),
    mondayThursdayAutoDiscountThresholdCents: moneyCentsSchema.optional(),
    mondayThursdayAutoDiscountAmountCents: moneyCentsSchema.optional(),
    giftCardAutoDiscountEnabled: z.boolean().optional(),
    giftCardAutoDiscountThresholdCents: moneyCentsSchema.optional(),
    giftCardAutoDiscountBps: commissionBpsSchema.optional(),
    closingDefaultLocale: closingImageLocaleSchema.optional(),
    automaticDispatchEnabled: z.boolean().optional(),
  })
  .superRefine((value, context) => {
    const fields = [
      value.mondayThursdayAutoDiscountEnabled,
      value.mondayThursdayAutoDiscountThresholdCents,
      value.mondayThursdayAutoDiscountAmountCents,
    ];
    const hasAnyAutomaticDiscountField = fields.some(
      (field) => field !== undefined,
    );
    const hasAllAutomaticDiscountFields = fields.every(
      (field) => field !== undefined,
    );
    if (hasAnyAutomaticDiscountField && !hasAllAutomaticDiscountFields) {
      context.addIssue({
        code: "custom",
        message: "自动折扣开关、门槛和额度必须一起保存",
        path: ["mondayThursdayAutoDiscountEnabled"],
      });
      return;
    }
    if (value.mondayThursdayAutoDiscountEnabled) {
      const threshold = value.mondayThursdayAutoDiscountThresholdCents ?? 0;
      const amount = value.mondayThursdayAutoDiscountAmountCents ?? 0;
      if (threshold <= 0) {
        context.addIssue({
          code: "custom",
          message: "自动折扣门槛必须大于 0",
          path: ["mondayThursdayAutoDiscountThresholdCents"],
        });
      }
      if (amount <= 0) {
        context.addIssue({
          code: "custom",
          message: "自动折扣额度必须大于 0",
          path: ["mondayThursdayAutoDiscountAmountCents"],
        });
      }
      if (amount > threshold) {
        context.addIssue({
          code: "custom",
          message: "自动折扣额度不能高于应用门槛",
          path: ["mondayThursdayAutoDiscountAmountCents"],
        });
      }
    }
    const giftCardFields = [
      value.giftCardAutoDiscountEnabled,
      value.giftCardAutoDiscountThresholdCents,
      value.giftCardAutoDiscountBps,
    ];
    const hasAnyGiftCardDiscountField = giftCardFields.some(
      (field) => field !== undefined,
    );
    const hasAllGiftCardDiscountFields = giftCardFields.every(
      (field) => field !== undefined,
    );
    if (hasAnyGiftCardDiscountField && !hasAllGiftCardDiscountFields) {
      context.addIssue({
        code: "custom",
        message: "礼物卡折扣开关、门槛和折扣比例必须一起保存",
        path: ["giftCardAutoDiscountEnabled"],
      });
      return;
    }
    if (value.giftCardAutoDiscountEnabled) {
      const giftCardThreshold = value.giftCardAutoDiscountThresholdCents ?? 0;
      const giftCardDiscountBps = value.giftCardAutoDiscountBps ?? 0;
      if (giftCardThreshold <= 0) {
        context.addIssue({
          code: "custom",
          message: "礼物卡自动折扣门槛必须大于 0",
          path: ["giftCardAutoDiscountThresholdCents"],
        });
      }
      if (giftCardDiscountBps <= 0 || giftCardDiscountBps >= 10_000) {
        context.addIssue({
          code: "custom",
          message: "礼物卡自动折扣必须大于 0% 且小于 100%",
          path: ["giftCardAutoDiscountBps"],
        });
      }
    } else if (
      hasAllGiftCardDiscountFields &&
      ((value.giftCardAutoDiscountThresholdCents ?? 0) !== 0 ||
        (value.giftCardAutoDiscountBps ?? 0) !== 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "关闭礼物卡自动折扣时，门槛和折扣比例必须为 0",
        path: ["giftCardAutoDiscountEnabled"],
      });
    }
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.timezone !== undefined ||
      value.businessCutoffLocal !== undefined ||
      value.globalCommissionBps !== undefined ||
      value.mondayThursdayAutoDiscountEnabled !== undefined ||
      value.giftCardAutoDiscountEnabled !== undefined ||
      value.automaticDispatchEnabled !== undefined ||
      value.closingDefaultLocale !== undefined,
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
  employmentType: employmentTypeSchema.optional(),
});

export const createEmployeeSchema = z.object({
  name: z.string().trim().min(1, "员工名字不能为空").max(80),
  employmentType: employmentTypeSchema.optional(),
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
    employmentType: employmentTypeSchema.nullable().optional(),
    defaultCommissionBps: commissionBpsSchema.nullable().optional(),
    closingDeliveryEnabled: z.boolean().optional(),
    closingDeliveryPhoneE164: optionalE164PhoneSchema.optional(),
    closingImageLocale: closingImageLocaleSchema.nullable().optional(),
  })
  .refine(
    (value) =>
      value.displayName !== undefined ||
      value.role !== undefined ||
      value.isServiceProvider !== undefined ||
      value.employmentType !== undefined ||
      value.defaultCommissionBps !== undefined ||
      value.closingDeliveryEnabled !== undefined ||
      value.closingDeliveryPhoneE164 !== undefined ||
      value.closingImageLocale !== undefined,
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
  employmentType: employmentTypeSchema.nullable().optional(),
});

export type CreateStoreInput = z.input<typeof createStoreSchema>;
export type CreateStore = z.output<typeof createStoreSchema>;
export type CreateJoinRequestInput = z.input<typeof createJoinRequestSchema>;
export type UpdateStoreInput = z.input<typeof updateStoreSchema>;
export type DeleteStoreInput = z.input<typeof deleteStoreSchema>;
export type TransferOwnerInput = z.input<typeof transferOwnerSchema>;
export type ApproveJoinRequestInput = z.input<typeof approveJoinRequestSchema>;
export type ApproveJoinRequest = z.output<typeof approveJoinRequestSchema>;
export type CreateEmployeeInput = z.input<typeof createEmployeeSchema>;
export type RejectJoinRequestInput = z.input<typeof rejectJoinRequestSchema>;
export type UpdateMembershipInput = z.input<typeof updateMembershipSchema>;
export type DeactivateMembershipInput = z.input<typeof deactivateMembershipSchema>;
export type RestoreMembershipInput = z.input<typeof restoreMembershipSchema>;
