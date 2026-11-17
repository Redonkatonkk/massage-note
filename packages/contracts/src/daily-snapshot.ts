import { z } from "zod";
import { businessDateSchema } from "./common.js";

export const CLOSING_DELIVERY_TEXT_PROTOCOL = "text-v1";
export const CLOSING_DELIVERY_PROTOCOL_HEADER = "X-Closing-Delivery-Protocol";
export const DAILY_SNAPSHOT_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export const prepareClosingTextSchema = z.strictObject({ leaseToken: z.uuid() });
export type PreparedClosingText = { authorized: false } | { authorized: true; text: string };

export const dailySnapshotTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const dailySnapshotDateQuery = z.strictObject({ date: businessDateSchema.optional() });
export const dailySnapshotCalendarQuery = z.strictObject({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/) });
const cents = z.number().int();
const nullableCents = cents.nullable();

/** The public statement only includes the fields used by the employee's work card. */
export const publicDailySnapshotSchema = z.object({
  storeName: z.string(),
  storeTimezone: z.string(),
  businessDate: businessDateSchema,
  isClosed: z.boolean(),
  employee: z.object({
    displayName: z.string(),
    cashLargeFeeDividendCents: cents,
    cardLargeFeeDividendCents: cents,
    cashTipDividendCents: cents,
    cardTipDividendCents: cents,
    confirmedLargeFeeWageCents: cents,
    confirmedTipWageCents: cents,
    confirmedIncomeCents: cents,
  }),
  records: z.array(z.object({
    serviceSelected: z.boolean().optional(),
    startAt: z.string().nullable(),
    endAt: z.string().nullable(),
    status: z.string(),
    serviceShortName: z.string(),
    serviceName: z.string(),
    addons: z.array(z.object({ shortName: z.string(), name: z.string() })),
    isHighlighted: z.boolean().optional(),
    discountTotalCents: cents.optional(),
    grossFeeBaseCents: cents,
    cashServiceCents: nullableCents,
    cardServiceCents: nullableCents,
    giftCardServiceCents: nullableCents,
    cashTipCents: nullableCents,
    cardTipCents: nullableCents,
    giftCardTipCents: nullableCents,
    employeeIncomeCents: nullableCents,
  })),
});

export const dailySnapshotMonthToDateSchema = z.object({
  dateFrom: businessDateSchema,
  dateTo: businessDateSchema,
  cashIncomeCents: cents,
  nonCashIncomeCents: cents,
  totalIncomeCents: cents,
});

export type DailySnapshotMonthToDate = z.infer<typeof dailySnapshotMonthToDateSchema>;
export type DailySnapshot = z.infer<typeof publicDailySnapshotSchema>;
export interface DailySnapshotResponse {
  snapshot: DailySnapshot;
  monthToDate: DailySnapshotMonthToDate;
  minDate: string;
  maxDate: string;
  expiresAt: string;
  locale: "zh_CN" | "en_US";
}
export interface DailySnapshotCalendar {
  dates: string[];
  closedDates: Array<{ date: string; revenueCents: number }>;
}
