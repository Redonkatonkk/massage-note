import { z } from "zod";
import {
  businessDateSchema,
  uuidSchema,
  versionSchema,
} from "./common.js";

export const clockInSchema = z.object({}).strict();

export const clockOutSchema = z.object({
  version: versionSchema,
});

export const addBoardRowSchema = z.object({
  membershipId: uuidSchema,
});

export const updateBoardRowSchema = z.object({
  version: versionSchema,
  isHidden: z.boolean(),
});

export const reorderBoardSchema = z.object({
  version: versionSchema,
  rowIds: z.array(uuidSchema).min(1, "排序列表不能为空").max(500),
});

export const rankBoardSchema = z.object({
  version: versionSchema,
});

export const dispatchKindSchema = z.enum([
  "REGULAR",
  "CLIENT_REQUESTED",
  "STORE_ASSIGNED",
]);

export const dispatchSkipReasonSchema = z.enum([
  "BUSY",
  "LATE",
  "REFUSED",
  "INELIGIBLE",
  "CUSTOMER_DECLINED",
  "STORE_RESTRICTION",
]);

export const createDispatchIntentSchema = z.object({
  version: versionSchema,
  kind: dispatchKindSchema,
  membershipId: uuidSchema.optional(),
}).superRefine((value, context) => {
  if (value.kind !== "REGULAR" && !value.membershipId) {
    context.addIssue({
      code: "custom",
      path: ["membershipId"],
      message: "点名或店里指定必须选择员工",
    });
  }
});

export const skipDispatchTurnSchema = z.object({
  version: versionSchema,
  membershipId: uuidSchema,
  reason: dispatchSkipReasonSchema,
});

export const cancelDispatchIntentSchema = z.object({
  version: versionSchema,
});

export const removeBoardRowSchema = z.object({
  version: versionSchema,
});

export const boardDateSchema = businessDateSchema;

export type ClockOutInput = z.input<typeof clockOutSchema>;
export type AddBoardRowInput = z.input<typeof addBoardRowSchema>;
export type UpdateBoardRowInput = z.input<typeof updateBoardRowSchema>;
export type ReorderBoardInput = z.input<typeof reorderBoardSchema>;
export type RankBoardInput = z.input<typeof rankBoardSchema>;
export type CreateDispatchIntentInput = z.input<typeof createDispatchIntentSchema>;
export type SkipDispatchTurnInput = z.input<typeof skipDispatchTurnSchema>;
export type CancelDispatchIntentInput = z.input<typeof cancelDispatchIntentSchema>;
export type RemoveBoardRowInput = z.input<typeof removeBoardRowSchema>;
