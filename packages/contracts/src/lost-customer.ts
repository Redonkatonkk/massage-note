import { z } from "zod";
import { businessDateSchema, uuidSchema, versionSchema } from "./common.js";

export const occurredTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "时间格式必须为 HH:mm");
export const listLostCustomersQuerySchema = z.object({ businessDate: businessDateSchema });
export const createLostCustomerSchema = z.object({
  businessDate: businessDateSchema,
  occurredTime: occurredTimeSchema,
}).strict();
export const updateLostCustomerSchema = z.object({
  version: versionSchema,
  occurredTime: occurredTimeSchema,
}).strict();
export const deleteLostCustomerSchema = z.object({ version: versionSchema }).strict();
export const lostCustomerSchema = z.object({
  id: uuidSchema,
  storeId: uuidSchema,
  businessDate: businessDateSchema,
  occurredTime: occurredTimeSchema,
  version: versionSchema,
});

export type CreateLostCustomerInput = z.infer<typeof createLostCustomerSchema>;
export type UpdateLostCustomerInput = z.infer<typeof updateLostCustomerSchema>;
export type DeleteLostCustomerInput = z.infer<typeof deleteLostCustomerSchema>;
