import { z } from "zod";
import {
  businessDateSchema,
  moneyCentsSchema,
  uuidSchema,
  versionSchema,
} from "./common.js";

const optionalReasonSchema = z.string().trim().min(1).max(500).optional();

export const closeBusinessDaySchema = z
  .object({
    force: z.boolean().default(false),
    forceReason: z.string().trim().min(1).max(500).optional(),
  })
  .superRefine((value, context) => {
    if (value.force && !value.forceReason) {
      context.addIssue({
        code: "custom",
        path: ["forceReason"],
        message: "强制日结必须填写原因",
      });
    }
    if (!value.force && value.forceReason) {
      context.addIssue({
        code: "custom",
        path: ["forceReason"],
        message: "普通日结不需要填写强制原因",
      });
    }
  });

export const cancelBusinessDayClosingSchema = z.object({
  version: versionSchema,
  reason: z.string().trim().min(1, "请填写取消日结原因").max(500),
});

const expectedSettlementVersionSchema = z.number().int().min(0);

export const settleCashSchema = z.object({
  version: expectedSettlementVersionSchema,
  note: z.string().trim().max(1_000).optional(),
});

export const reopenCashSchema = z.object({
  version: versionSchema,
  reason: z.string().trim().min(1, "请填写取消结清原因").max(500),
});

export const settleAllCashSchema = z.object({
  settlements: z
    .array(
      z.object({
        membershipId: uuidSchema,
        version: expectedSettlementVersionSchema,
        note: z.string().trim().max(1_000).optional(),
      }),
    )
    .min(1)
    .max(500),
});

const signedMoneyCentsSchema = z
  .number()
  .int("调整金额必须使用整数美分")
  .min(Number.MIN_SAFE_INTEGER, "调整金额超出系统允许范围")
  .max(Number.MAX_SAFE_INTEGER, "调整金额超出系统允许范围");

export const payrollPaymentMethodSchema = z.enum([
  "CASH",
  "CARD",
  "CHECK",
  "ZELLE",
  "OTHER",
]);

const payrollAmounts = {
  serviceWageCents: moneyCentsSchema,
  cashTipCents: moneyCentsSchema,
  cardTipCents: moneyCentsSchema,
  adjustmentCents: signedMoneyCentsSchema,
};

export const createPayrollSettlementSchema = z
  .object({
    membershipId: uuidSchema,
    settlementDate: businessDateSchema,
    periodStart: businessDateSchema,
    periodEnd: businessDateSchema,
    ...payrollAmounts,
    paymentMethod: payrollPaymentMethodSchema,
    note: z.string().max(2_000).default(""),
    negativeTotalReason: z.string().trim().min(1).max(500).optional(),
  })
  .superRefine((value, context) => {
    if (value.periodEnd < value.periodStart) {
      context.addIssue({
        code: "custom",
        path: ["periodEnd"],
        message: "覆盖结束日期不能早于开始日期",
      });
    }
    const total =
      value.serviceWageCents +
      value.cashTipCents +
      value.cardTipCents +
      value.adjustmentCents;
    if (total < 0 && !value.negativeTotalReason) {
      context.addIssue({
        code: "custom",
        path: ["negativeTotalReason"],
        message: "负数支付总额必须二次确认并填写原因",
      });
    }
  });

export const updatePayrollSettlementSchema = z
  .object({
    version: versionSchema,
    settlementDate: businessDateSchema.optional(),
    periodStart: businessDateSchema.optional(),
    periodEnd: businessDateSchema.optional(),
    serviceWageCents: moneyCentsSchema.optional(),
    cashTipCents: moneyCentsSchema.optional(),
    cardTipCents: moneyCentsSchema.optional(),
    adjustmentCents: signedMoneyCentsSchema.optional(),
    paymentMethod: payrollPaymentMethodSchema.optional(),
    note: z.string().max(2_000).optional(),
    negativeTotalReason: z.string().trim().min(1).max(500).optional(),
  })
  .refine(
    (value) => Object.keys(value).some((key) => key !== "version"),
    "至少需要修改一个工资结算字段",
  );

export const deletePayrollSettlementSchema = z.object({
  version: versionSchema,
  reason: optionalReasonSchema,
});

export const restorePayrollSettlementSchema = z.object({
  version: versionSchema,
});

const membershipIdsQuerySchema = z
  .union([z.string(), z.array(z.string())])
  .optional()
  .transform((value) => {
    if (!value) return [];
    return (Array.isArray(value) ? value : value.split(","))
      .map((item) => item.trim())
      .filter(Boolean);
  })
  .pipe(z.array(uuidSchema).max(500));

export const financeQuerySchema = z
  .object({
    dateFrom: businessDateSchema.optional(),
    dateTo: businessDateSchema.optional(),
    membershipIds: membershipIdsQuerySchema,
    paymentMethod: z.enum(["ALL", "CASH", "CARD", "GIFT_CARD"]).default("ALL"),
    amountType: z.enum(["ALL", "SERVICE", "TIP"]).default("ALL"),
    highlightFilter: z
      .enum(["ALL", "ONLY_HIGHLIGHTED", "EXCLUDE_HIGHLIGHTED"])
      .default("ALL"),
  })
  .superRefine((value, context) => {
    if (value.dateFrom && value.dateTo && value.dateTo < value.dateFrom) {
      context.addIssue({
        code: "custom",
        path: ["dateTo"],
        message: "结束日期不能早于开始日期",
      });
    }
  });

export const calendarDateRangeQuerySchema = z
  .object({
    dateFrom: businessDateSchema,
    dateTo: businessDateSchema,
  })
  .superRefine((value, context) => {
    if (value.dateTo < value.dateFrom) {
      context.addIssue({
        code: "custom",
        path: ["dateTo"],
        message: "结束日期不能早于开始日期",
      });
      return;
    }
    const from = new Date(`${value.dateFrom}T00:00:00.000Z`);
    const to = new Date(`${value.dateTo}T00:00:00.000Z`);
    const rangeDays = Math.round((to.getTime() - from.getTime()) / 86_400_000);
    if (rangeDays > 62) {
      context.addIssue({
        code: "custom",
        path: ["dateTo"],
        message: "日历查询范围不能超过 63 天",
      });
    }
  });

export const payrollListQuerySchema = z.object({
  membershipId: uuidSchema.optional(),
  includeDeleted: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((value) => value === "true"),
});

export type CloseBusinessDayInput = z.output<typeof closeBusinessDaySchema>;
export type CancelBusinessDayClosingInput = z.input<
  typeof cancelBusinessDayClosingSchema
>;
export type SettleCashInput = z.input<typeof settleCashSchema>;
export type ReopenCashInput = z.input<typeof reopenCashSchema>;
export type SettleAllCashInput = z.input<typeof settleAllCashSchema>;
export type CreatePayrollSettlementInput = z.output<
  typeof createPayrollSettlementSchema
>;
export type UpdatePayrollSettlementInput = z.input<
  typeof updatePayrollSettlementSchema
>;
export type DeletePayrollSettlementInput = z.input<
  typeof deletePayrollSettlementSchema
>;
export type RestorePayrollSettlementInput = z.input<
  typeof restorePayrollSettlementSchema
>;
export type FinanceQuery = z.output<typeof financeQuerySchema>;
export type CalendarDateRangeQuery = z.output<typeof calendarDateRangeQuerySchema>;
export type PayrollListQuery = z.output<typeof payrollListQuerySchema>;
