import { z } from "zod";

export const uuidSchema = z.uuid();

export const moneyCentsSchema = z
  .number()
  .int("金额必须使用整数美分")
  .min(0, "金额不能为负数")
  .max(Number.MAX_SAFE_INTEGER, "金额超出系统允许范围");

export const commissionBpsSchema = z
  .number()
  .int("提成比例必须是万分比整数")
  .min(0, "提成比例不能低于 0%")
  .max(10_000, "提成比例不能超过 100%");

export const businessDateSchema = z.iso.date();
export const instantSchema = z.iso.datetime({ offset: true });

export const versionSchema = z.number().int().positive();

export const idempotencyKeySchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

export const apiErrorSchema = z.object({
  code: z.string(),
  messageZh: z.string(),
  requestId: z.string(),
  fieldErrors: z.record(z.string(), z.array(z.string())).optional(),
  latestResource: z.unknown().optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;

