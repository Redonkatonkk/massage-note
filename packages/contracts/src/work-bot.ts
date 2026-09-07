import { z } from "zod";
import { instantSchema, versionSchema } from "./common.js";

const externalIdSchema = z.string().trim().min(1).max(255);

export const workBotParsedIntentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("BIND_STORE"), storeCode: z.string().regex(/^\d{6}$/) }),
  z.object({
    kind: z.literal("BIND_MEMBER"),
    memberName: z.string().trim().min(1).max(80),
    memberMention: z.string().trim().min(1).max(80).optional(),
  }),
  z.object({
    kind: z.literal("START"),
    serviceAlias: z.string().trim().min(1).max(80),
    serviceMention: z.string().trim().min(1).max(80).optional(),
    durationMinutes: z.number().int().min(1).max(720).optional(),
    durationMention: z.string().trim().min(1).max(80).optional(),
    memberName: z.string().trim().min(1).max(80).optional(),
    memberMention: z.string().trim().min(1).max(80).optional(),
  }),
  z.object({
    kind: z.literal("FINISH"),
    serviceAmount: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
    tipAmount: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
    paymentMethod: z.enum(["CASH", "CARD"]),
    paymentMention: z.string().trim().min(1).max(80).optional(),
  }),
  z.object({ kind: z.literal("HELP") }),
]);

export const workBotEventSchema = z.object({
  platform: z.literal("WECHATPAD"),
  botId: externalIdSchema,
  groupId: externalIdSchema,
  senderId: externalIdSchema,
  messageId: externalIdSchema,
  occurredAt: instantSchema,
  rawText: z.string().trim().min(1).max(1000),
  parsedIntent: workBotParsedIntentSchema.optional(),
});

export const workBotContextRequestSchema = z.object({
  platform: z.literal("WECHATPAD"),
  botId: externalIdSchema,
  groupId: externalIdSchema,
  senderId: externalIdSchema,
});

export const createWorkBotAliasSchema = z.object({
  alias: z.string().trim().min(1).max(80),
  serviceItemId: z.uuid(),
  durationMinutes: z.number().int().min(1).max(720),
});

export const updateWorkBotAliasSchema = createWorkBotAliasSchema.extend({
  version: versionSchema,
  isEnabled: z.boolean(),
});

export const deleteWorkBotBindingSchema = z.object({ version: versionSchema });

export type WorkBotParsedIntent = z.infer<typeof workBotParsedIntentSchema>;
export type WorkBotEventInput = z.infer<typeof workBotEventSchema>;
export type WorkBotContextRequest = z.infer<typeof workBotContextRequestSchema>;
export type CreateWorkBotAliasInput = z.infer<typeof createWorkBotAliasSchema>;
export type UpdateWorkBotAliasInput = z.infer<typeof updateWorkBotAliasSchema>;
