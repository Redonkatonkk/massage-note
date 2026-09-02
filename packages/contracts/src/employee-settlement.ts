import { z } from "zod";
import { businessDateSchema, uuidSchema } from "./common.js";

export const employeeSettlementPaymentScopeSchema = z.enum(["CASH", "NON_CASH", "ALL"]);

export const employeeSettlementQuerySchema = z.object({
  membershipId: uuidSchema,
  dateFrom: businessDateSchema,
  dateTo: businessDateSchema,
  paymentScope: employeeSettlementPaymentScopeSchema.default("ALL"),
}).superRefine((value, context) => {
  if (value.dateTo < value.dateFrom) {
    context.addIssue({ code: "custom", path: ["dateTo"], message: "结束日期不能早于开始日期" });
  }
});

export const createEmployeeSettlementDeliverySchema = employeeSettlementQuerySchema;

export const createEmployeeSummaryDeliverySchema = z.object({
  dateFrom: businessDateSchema,
  dateTo: businessDateSchema,
  membershipIds: z.array(uuidSchema).max(500),
  paymentMethod: z.enum(["ALL", "CASH", "NON_CASH"]),
  amountType: z.enum(["ALL", "SERVICE", "TIP"]),
  highlightFilter: z.enum(["ALL", "ONLY_HIGHLIGHTED", "EXCLUDE_HIGHLIGHTED"]),
  recipientPhoneE164: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, "短信号码必须使用国际格式，例如 +16465551234"),
}).superRefine((value, context) => {
  if (value.dateTo < value.dateFrom) {
    context.addIssue({ code: "custom", path: ["dateTo"], message: "结束日期不能早于开始日期" });
  }
});

export const employeeSettlementAttachmentSchema = z.object({
  leaseToken: z.uuid(),
  attachment: z.enum(["SUMMARY", "DETAIL"]),
});

export type EmployeeSettlementPaymentScope = z.output<typeof employeeSettlementPaymentScopeSchema>;
export type EmployeeSettlementQuery = z.output<typeof employeeSettlementQuerySchema>;
export type CreateEmployeeSettlementDeliveryInput = z.output<typeof createEmployeeSettlementDeliverySchema>;
export type CreateEmployeeSummaryDeliveryInput = z.output<typeof createEmployeeSummaryDeliverySchema>;
export type EmployeeSettlementAttachmentInput = z.output<typeof employeeSettlementAttachmentSchema>;
