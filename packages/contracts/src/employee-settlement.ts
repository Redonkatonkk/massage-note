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

export const employeeSettlementAttachmentSchema = z.object({
  leaseToken: z.uuid(),
  attachment: z.enum(["SUMMARY", "DETAIL"]),
});

export type EmployeeSettlementPaymentScope = z.output<typeof employeeSettlementPaymentScopeSchema>;
export type EmployeeSettlementQuery = z.output<typeof employeeSettlementQuerySchema>;
export type CreateEmployeeSettlementDeliveryInput = z.output<typeof createEmployeeSettlementDeliverySchema>;
export type EmployeeSettlementAttachmentInput = z.output<typeof employeeSettlementAttachmentSchema>;
