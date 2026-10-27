import { z } from "zod";

export const closingDeliveryFailureSchema = z.object({
  leaseToken: z.uuid(),
  code: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(1000),
  retryable: z.boolean().default(false),
});

export const messagesReceiptSchema = z.object({
  messageGuid: z.string().trim().min(1).max(255),
  state: z.enum(["SENT", "DELIVERED", "FAILED"]),
  errorCode: z.number().int().nonnegative(),
  service: z.string().trim().max(40).nullable(),
}).refine(value => value.state === "FAILED" ? value.errorCode !== 0 : value.errorCode === 0, "Receipt state and error code must agree");

export const closingDeliveryReceiptSchema = z.object({
  attemptCount: z.number().int().positive(),
  receipt: z.union([messagesReceiptSchema, z.object({
    messageGuid: z.string().trim().min(1).max(255).nullable(),
    state: z.enum(["MISSING", "PENDING"]),
    errorCode: z.literal(0),
    service: z.string().trim().max(40).nullable(),
  })]),
});

export const closingDeliveryCompleteSchema = z.object({
  leaseToken: z.uuid(),
  receipt: messagesReceiptSchema.optional().refine(value => value?.state !== "FAILED", "Failed messages cannot complete a task"),
});

export const closingDeliveryAuthorizeSchema = closingDeliveryCompleteSchema;

export const closingAgentHeartbeatSchema = z.object({
  messagesAvailable: z.boolean(),
  serviceTypes: z.array(z.enum(["iMessage", "RCS", "SMS"])).max(3),
  version: z.string().trim().max(40),
  lastError: z.string().trim().max(1000).nullable().optional(),
});

export type ClosingDeliveryFailureInput = z.input<typeof closingDeliveryFailureSchema>;
export type MessagesReceipt = z.infer<typeof messagesReceiptSchema>;
export type ClosingDeliveryReceiptInput = z.infer<typeof closingDeliveryReceiptSchema>;
export type ClosingAgentHeartbeatInput = z.input<typeof closingAgentHeartbeatSchema>;
