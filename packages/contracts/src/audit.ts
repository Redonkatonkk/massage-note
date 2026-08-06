import { z } from "zod";
import { businessDateSchema, uuidSchema } from "./common.js";

const optionalTrimmed = z.string().trim().max(120).optional();

export const auditLogQuerySchema = z
  .object({
    cursor: uuidSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(30),
    dateFrom: businessDateSchema.optional(),
    dateTo: businessDateSchema.optional(),
    action: optionalTrimmed,
    entityType: optionalTrimmed,
    actorMembershipId: uuidSchema.optional(),
  })
  .refine(
    (value) => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo,
    { message: "开始日期不能晚于结束日期", path: ["dateTo"] },
  );

export type AuditLogQuery = z.output<typeof auditLogQuerySchema>;
