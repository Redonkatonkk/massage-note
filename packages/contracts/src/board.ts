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
}).strict();

export const removeBoardRowSchema = z.object({
  version: versionSchema,
});

export const boardDateSchema = businessDateSchema;

export type ClockOutInput = z.input<typeof clockOutSchema>;
export type AddBoardRowInput = z.input<typeof addBoardRowSchema>;
export type UpdateBoardRowInput = z.input<typeof updateBoardRowSchema>;
export type ReorderBoardInput = z.input<typeof reorderBoardSchema>;
export type RankBoardInput = z.input<typeof rankBoardSchema>;
export type RemoveBoardRowInput = z.input<typeof removeBoardRowSchema>;
