import { z } from "zod";
import { businessDateSchema, instantSchema, uuidSchema, versionSchema } from "./common.js";

import { updateWorkRecordSchema, createWorkRecordSchema } from "./work-record.js";

const externalIdSchema = z.string().trim().min(1).max(255);

const workAdjustments = {
  recordId: uuidSchema.optional(),
  isHighlighted: z.boolean().optional(),
  highlightMention: z.string().trim().min(1).max(80).optional(),
  memberName: z.string().trim().min(1).max(80).optional(),
  memberMention: z.string().trim().min(1).max(80).optional(),
  discounts: z.array(z.object({ name: z.string().trim().min(1).max(80), mention: z.string().trim().min(1).max(80), action: z.enum(["ADD", "REMOVE"]).optional() })).max(20).optional(),
  addons: z.array(z.object({ name: z.string().trim().min(1).max(80), mention: z.string().trim().min(1).max(80), action: z.enum(["ADD", "REMOVE"]).optional() })).max(20).optional(),
};

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
    durationSource: z.literal("SKILL").optional(),
    memberName: z.string().trim().min(1).max(80).optional(),
    memberMention: z.string().trim().min(1).max(80).optional(),
  }),
  z.object({
    kind: z.literal("FINISH"),
    ...workAdjustments,
    serviceAmount: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
    tipAmount: z.string().regex(/^\d+(?:\.\d{1,2})?$/),
    paymentMethod: z.enum(["CASH", "CARD"]),
    paymentMention: z.string().trim().min(1).max(80).optional(),
  }),
  z.object({ kind: z.literal("ADJUST"), ...workAdjustments }),
  z.object({
    kind: z.literal("QUERY"),
    memberName: z.string().trim().min(1).max(80).optional(),
    memberMention: z.string().trim().min(1).max(80).optional(),
    days: z.number().int().min(1).max(366).optional(),
    dateFrom: businessDateSchema.optional(), dateTo: businessDateSchema.optional(),
    status: z.enum(["CONFIRMED", "PENDING_PAYMENT", "ALL", "DELETED"]).optional(),
    highlightedOnly: z.boolean().optional(),
    groupBy: z.enum(["RECORD", "DAY", "EMPLOYEE"]).optional(),
    page: z.number().int().min(1).max(10000).optional(),
    recordId: uuidSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal("MANAGE"),
    operation: z.enum(["CREATE", "UPDATE", "PAYMENT", "DELETE", "RESTORE"]),
    recordId: uuidSchema.optional(),
    create: createWorkRecordSchema.optional(),
    // Version comes from the authoritative record at execution time.
    details: z.object({ ...updateWorkRecordSchema.shape }).omit({ version: true }).strict().optional(),
    payment: z.object({
      cashServiceCents: z.number().int().nonnegative().optional(), cardServiceCents: z.number().int().nonnegative().optional(),
      giftCardServiceCents: z.number().int().nonnegative().optional(), cashTipCents: z.number().int().nonnegative().optional(),
      cardTipCents: z.number().int().nonnegative().optional(), giftCardTipCents: z.number().int().nonnegative().optional(),
      giftCardSerialNumber: z.string().trim().min(1).max(80).nullable().optional(),
    }).strict().optional(),
    reason: z.string().trim().min(1).max(500).optional(),
    evidence: z.string().trim().min(1).max(1000),
  }).strict(),
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

export const updateWorkBotInstructionsSchema = z.object({ instructions: z.string().trim().max(12000), version: versionSchema });

export const verifyWorkBotBindingSchema = z.object({ version: versionSchema, verified: z.boolean() });
