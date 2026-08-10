import { z } from "zod";
import { uuidSchema } from "./common.js";

export const aiMessageSchema = z.object({
  text: z.string().trim().min(1, "请输入要询问或记录的内容").max(4_000),
  conversationId: uuidSchema.optional(),
});

export const confirmAiPreviewSchema = z.object({
  confirm: z.literal(true, { error: "请明确确认后再执行" }),
});

const aiNamedAmountSchema = z.object({
  name: z.string().trim().min(1).max(120),
  amountCents: z.number().int().min(0).optional(),
}).strict();

const aiWorkDetails = {
  startAt: z.iso.datetime({ offset: true }).optional(),
  endAt: z.iso.datetime({ offset: true }).nullable().optional(),
  addons: z.array(aiNamedAmountSchema).max(30).optional(),
  discounts: z.array(aiNamedAmountSchema).max(30).optional(),
  mainServiceAmountCents: z.number().int().min(0).optional(),
  cashServiceCents: z.number().int().min(0).optional(),
  cardServiceCents: z.number().int().min(0).optional(),
  cashTipCents: z.number().int().min(0).optional(),
  cardTipCents: z.number().int().min(0).optional(),
  note: z.string().max(2_000).optional(),
};

export const aiWorkToolArgumentsSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("CREATE"),
    employeeName: z.string().trim().min(1).max(80),
    serviceName: z.string().trim().min(1).max(120),
    serviceDurationMinutes: z.number().int().min(1).max(720),
    ...aiWorkDetails,
  }).strict(),
  z.object({
    operation: z.literal("UPDATE"),
    recordId: uuidSchema,
    employeeName: z.string().trim().min(1).max(80).optional(),
    serviceName: z.string().trim().min(1).max(120).optional(),
    serviceDurationMinutes: z.number().int().min(1).max(720).optional(),
    ...aiWorkDetails,
  }).strict().superRefine((value, context) => {
    if (Boolean(value.serviceName) !== Boolean(value.serviceDurationMinutes)) {
      context.addIssue({
        code: "custom",
        path: [value.serviceName ? "serviceDurationMinutes" : "serviceName"],
        message: "更换主要项目时必须同时提供项目名称和时长",
      });
    }
  }),
  z.object({
    operation: z.literal("DELETE"),
    recordId: uuidSchema,
    reason: z.string().trim().min(1).max(500),
  }).strict(),
]);

export type AiMessageInput = z.input<typeof aiMessageSchema>;
export type AiWorkToolArguments = z.output<typeof aiWorkToolArgumentsSchema>;
