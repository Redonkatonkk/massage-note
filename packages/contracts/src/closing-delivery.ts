import { z } from "zod";

export const closingDeliveryFailureSchema = z.object({
  leaseToken: z.uuid(),
  code: z.string().trim().min(1).max(80),
  message: z.string().trim().min(1).max(1000),
  retryable: z.boolean().default(false),
});

export const closingDeliveryCompleteSchema = z.object({
  leaseToken: z.uuid(),
});

export const closingDeliveryAuthorizeSchema = z.object({
  leaseToken: z.uuid(),
});

export const closingAgentHeartbeatSchema = z.object({
  messagesAvailable: z.boolean(),
  serviceTypes: z.array(z.enum(["iMessage", "RCS", "SMS"])).max(3),
  version: z.string().trim().max(40),
  lastError: z.string().trim().max(1000).nullable().optional(),
});

export type ClosingDeliveryFailureInput = z.input<typeof closingDeliveryFailureSchema>;
export type ClosingDeliveryCompleteInput = z.input<typeof closingDeliveryCompleteSchema>;
export type ClosingDeliveryAuthorizeInput = z.input<typeof closingDeliveryAuthorizeSchema>;
export type ClosingAgentHeartbeatInput = z.input<typeof closingAgentHeartbeatSchema>;
