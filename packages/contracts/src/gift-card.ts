import { z } from "zod";
import {
  businessDateSchema,
  moneyCentsSchema,
  uuidSchema,
  versionSchema,
} from "./common.js";

export const giftCardSerialNumberSchema = z.string().trim().min(1).max(120);

export const createGiftCardSaleSchema = z
  .object({
    businessDate: businessDateSchema,
    serialNumber: giftCardSerialNumberSchema.optional(),
    faceValueCents: moneyCentsSchema.optional(),
    cashCents: moneyCentsSchema.default(0),
    cardCents: moneyCentsSchema.default(0),
    operatorMembershipId: uuidSchema,
  })
  .superRefine((value, context) => {
    if (value.faceValueCents !== undefined && value.faceValueCents <= 0) {
      context.addIssue({
        code: "custom",
        message: "礼物卡总金额必须大于 0",
        path: ["faceValueCents"],
      });
    }
    if (value.cashCents + value.cardCents <= 0) {
      context.addIssue({
        code: "custom",
        message: "礼物卡付款总额必须大于 0",
        path: ["cashCents"],
      });
    }
  });

export const updateGiftCardSaleSchema = z
  .object({
    version: versionSchema,
    serialNumber: giftCardSerialNumberSchema.optional(),
    faceValueCents: moneyCentsSchema.optional(),
    cashCents: moneyCentsSchema.optional(),
    cardCents: moneyCentsSchema.optional(),
    operatorMembershipId: uuidSchema.optional(),
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== "version"),
    "至少需要修改一个礼物卡字段",
  );

export const deleteGiftCardSaleSchema = z.object({
  version: versionSchema,
  reason: z.string().trim().min(1).max(500).optional(),
});

export const restoreGiftCardSaleSchema = z.object({ version: versionSchema });

export type CreateGiftCardSaleInput = z.output<typeof createGiftCardSaleSchema>;
export type UpdateGiftCardSaleInput = z.input<typeof updateGiftCardSaleSchema>;
export type DeleteGiftCardSaleInput = z.input<typeof deleteGiftCardSaleSchema>;
export type RestoreGiftCardSaleInput = z.input<typeof restoreGiftCardSaleSchema>;
