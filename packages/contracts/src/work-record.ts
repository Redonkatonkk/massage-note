import { z } from "zod";
import {
  businessDateSchema,
  commissionBpsSchema,
  instantSchema,
  moneyCentsSchema,
  uuidSchema,
  versionSchema,
} from "./common.js";
import { giftCardSerialNumberSchema } from "./gift-card.js";

const namedAmountFields = {
  name: z.string().trim().min(1).max(120),
  shortName: z.string().trim().min(1).max(30),
  amountCents: moneyCentsSchema,
};

function validateItemSource(
  value: { sourceItemId?: string | null | undefined; isCustom: boolean },
  context: z.RefinementCtx,
): void {
  if (value.isCustom && value.sourceItemId != null) {
    context.addIssue({
      code: "custom",
      path: ["sourceItemId"],
      message: "自定义项目不能引用预设项目",
    });
  }
  if (!value.isCustom && value.sourceItemId == null) {
    context.addIssue({
      code: "custom",
      path: ["sourceItemId"],
      message: "预设项目必须提供项目编号",
    });
  }
}

export const addonInputSchema = z
  .object({
    sourceItemId: uuidSchema.nullable().optional(),
    isCustom: z.boolean(),
    ...namedAmountFields,
    durationMinutes: z.number().int().min(0).max(720).nullable().optional(),
    commissionBps: commissionBpsSchema.optional(),
  })
  .superRefine(validateItemSource);

export const discountInputSchema = z
  .object({
    sourceItemId: uuidSchema.nullable().optional(),
    isCustom: z.boolean(),
    name: namedAmountFields.name,
    amountCents: namedAmountFields.amountCents,
  })
  .superRefine(validateItemSource);

export const createWorkRecordSchema = z.object({
  employeeMembershipId: uuidSchema,
  startAt: instantSchema,
  serviceItemId: uuidSchema.optional(),
  serviceDurationMinutes: z.number().int().min(1).max(720).optional(),
  customService: z
    .object({
      ...namedAmountFields,
      durationMinutes: z.number().int().min(1).max(720),
    })
    .optional(),
  isHighlighted: z.boolean().optional(),
}).refine((value) => Boolean(value.serviceItemId) !== Boolean(value.customService), {
  message: "预设项目和自定义项目必须且只能选择一种",
  path: ["serviceItemId"],
}).refine((value) => value.serviceItemId || value.serviceDurationMinutes === undefined, {
  message: "项目时长只能与预设项目一起提交",
  path: ["serviceDurationMinutes"],
});

export const updateWorkRecordSchema = z.object({
  version: versionSchema,
  employeeMembershipId: uuidSchema.optional(),
  businessDate: businessDateSchema.optional(),
  startAt: instantSchema.optional(),
  endAt: instantSchema.nullable().optional(),
  serviceItemId: uuidSchema.optional(),
  serviceDurationMinutes: z.number().int().min(1).max(720).optional(),
  customService: z
    .object({
      ...namedAmountFields,
      durationMinutes: z.number().int().min(1).max(720),
    })
    .optional(),
  mainServiceAmountCents: moneyCentsSchema.optional(),
  mainServiceCommissionBps: commissionBpsSchema.optional(),
  addons: z.array(addonInputSchema).max(30).optional(),
  discounts: z.array(discountInputSchema).max(30).optional(),
  automaticDiscountSuppressed: z.boolean().optional(),
  isHighlighted: z.boolean().optional(),
  tipSettledManualFlag: z.boolean().optional(),
  largeFeeSettledManualFlag: z.boolean().optional(),
  note: z.string().max(2_000).optional(),
}).refine(
  (value) => !(value.serviceItemId && value.customService),
  {
    message: "修改主要项目时，预设项目和自定义项目只能选择一种",
    path: ["serviceItemId"],
  },
).refine((value) => value.serviceItemId || value.serviceDurationMinutes === undefined, {
  message: "项目时长只能与预设项目一起提交",
  path: ["serviceDurationMinutes"],
});

export const deleteWorkRecordSchema = z.object({
  version: versionSchema,
  reason: z.string().trim().min(1).max(500).optional(),
});

export const restoreWorkRecordSchema = z.object({
  version: versionSchema,
});

export const confirmPaymentSchema = z
  .object({
    version: versionSchema,
    cashServiceCents: moneyCentsSchema.optional(),
    cardServiceCents: moneyCentsSchema.optional(),
    giftCardSerialNumber: giftCardSerialNumberSchema.optional(),
    giftCardServiceCents: moneyCentsSchema.optional(),
    cashTipCents: moneyCentsSchema.optional(),
    cardTipCents: moneyCentsSchema.optional(),
    giftCardTipCents: moneyCentsSchema.optional(),
  })
  .superRefine((value, context) => {
    if (
      value.cashServiceCents === undefined &&
      value.cardServiceCents === undefined &&
      value.giftCardServiceCents === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["cashServiceCents"],
        message: "现金、刷卡和礼物卡大费至少填写一项；免费服务请明确填写 0",
      });
    }
    const giftCardTotal =
      (value.giftCardServiceCents ?? 0) + (value.giftCardTipCents ?? 0);
    if (giftCardTotal > 0 && !value.giftCardSerialNumber) {
      context.addIssue({
        code: "custom",
        path: ["giftCardSerialNumber"],
        message: "使用礼物卡时必须填写序列号",
      });
    }
    if (value.giftCardSerialNumber && giftCardTotal === 0) {
      context.addIssue({
        code: "custom",
        path: ["giftCardServiceCents"],
        message: "使用礼物卡时，大费或小费金额必须大于 0",
      });
    }
  })
  .transform((value) => ({
    version: value.version,
    cashServiceCents: value.cashServiceCents ?? 0,
    cardServiceCents: value.cardServiceCents ?? 0,
    giftCardSerialNumber: value.giftCardSerialNumber ?? null,
    giftCardServiceCents: value.giftCardServiceCents ?? 0,
    cashTipCents: value.cashTipCents ?? 0,
    cardTipCents: value.cardTipCents ?? 0,
    giftCardTipCents: value.giftCardTipCents ?? 0,
  }));

export type CreateWorkRecordInput = z.input<typeof createWorkRecordSchema>;
export type UpdateWorkRecordInput = z.input<typeof updateWorkRecordSchema>;
export type ConfirmPaymentInput = z.input<typeof confirmPaymentSchema>;
export type ConfirmedPayment = z.output<typeof confirmPaymentSchema>;
export type DeleteWorkRecordInput = z.input<typeof deleteWorkRecordSchema>;
export type RestoreWorkRecordInput = z.input<typeof restoreWorkRecordSchema>;
