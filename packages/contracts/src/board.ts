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

export const weeklyDispatchSchema = z.object({
  monday: z.array(uuidSchema).max(200),
  tuesday: z.array(uuidSchema).max(200),
  wednesday: z.array(uuidSchema).max(200),
  thursday: z.array(uuidSchema).max(200),
  friday: z.array(uuidSchema).max(200),
  saturday: z.array(uuidSchema).max(200),
  sunday: z.array(uuidSchema).max(200),
}).strict();
export const updateWeeklyDispatchSchema = z.object({
  version: versionSchema,
  schedule: weeklyDispatchSchema,
  businessDate: businessDateSchema.optional(),
  boardVersion: z.number().int().nonnegative().optional(),
  fullTimeOrder: z.array(uuidSchema).max(500).optional(),
}).strict().superRefine((value, context) => {
  const fields = [value.businessDate, value.boardVersion, value.fullTimeOrder];
  if (fields.some(field => field !== undefined) && fields.some(field => field === undefined)) {
    context.addIssue({ code: "custom", message: "日期、表格版本和全职顺序必须一起提交" });
  }
  if (value.fullTimeOrder && new Set(value.fullTimeOrder).size !== value.fullTimeOrder.length) {
    context.addIssue({ code: "custom", message: "全职顺序不能重复" });
  }
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
export type WeeklyDispatchInput = z.input<typeof weeklyDispatchSchema>;
export type UpdateWeeklyDispatchInput = z.input<typeof updateWeeklyDispatchSchema>;
export type RemoveBoardRowInput = z.input<typeof removeBoardRowSchema>;

export const rankingExplanationSchema = z.object({
  schemaVersion: z.union([z.literal(1), z.literal(2)]),
  generatedAt: z.string(),
  fullTimeOrder: z.array(z.string()).optional(),
  entries: z.array(z.object({
    membershipId: z.string(),
    displayName: z.string(),
    employmentType: z.enum(["FULL_TIME", "PART_TIME"]),
    lastPosition: z.number().int().positive().nullable(),
    lastBusinessDate: z.string().nullable(),
    generatedPosition: z.number().int().positive(),
    targetPosition: z.number().int().positive().nullable().optional(),
    fullTimePosition: z.number().int().positive().nullable().optional(),
    ties: z.array(z.object({
      membershipId: z.string(),
      ahead: z.boolean(),
      rule: z.enum(["EMPLOYMENT_TYPE", "RECENT_ATTENDANCE", "STABLE_ID", "EARLIER_ATTENDANCE"]),
    })),
  })),
});
export type RankingExplanation = z.infer<typeof rankingExplanationSchema>;
