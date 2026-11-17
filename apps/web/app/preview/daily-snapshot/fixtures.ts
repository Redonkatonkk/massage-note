import type { ClosingSnapshot } from "@massage-note/domain";
import type { DailySnapshotMonthToDate } from "@massage-note/contracts";

type ClosingRecord = ClosingSnapshot["records"][number];

// Synthetic design fixtures only. Never import business data into this public preview.
function record(date: string, id: string, start: string, end: string, values: Partial<ClosingRecord>): ClosingRecord {
  return {
    id, startAt: `${date}T${start}:00-05:00`, endAt: `${date}T${end}:00-05:00`,
    status: "CONFIRMED", serviceName: "Body massage", serviceShortName: "Body · 60 min", addons: [],
    grossFeeBaseCents: 7000, cashServiceCents: 0, cardServiceCents: 0, giftCardServiceCents: 0,
    cashTipCents: 0, cardTipCents: 0, giftCardTipCents: 0, employeeIncomeCents: 0, ...values,
  };
}

const employee = {
  displayName: "Lily", grossFeeBaseCents: 0, cashToSubmitToStoreCents: 0,
  cashLargeFeeDividendCents: 0, cardLargeFeeDividendCents: 0,
  cashTipDividendCents: 0, cardTipDividendCents: 0,
  confirmedLargeFeeWageCents: 0, confirmedTipWageCents: 0, confirmedIncomeCents: 0,
};

const base = { storeName: "Willow Massage · Demo", storeTimezone: "America/New_York" };

export const dailySnapshotFixtures: readonly ClosingSnapshot[] = [
  { ...base, businessDate: "2026-11-12", isClosed: true, activeClosing: { cycleNo: 1 }, employee: { ...employee }, records: [] },
  {
    ...base, businessDate: "2026-11-13", isClosed: true, activeClosing: { cycleNo: 1 },
    employee: { ...employee, grossFeeBaseCents: 7000, cashToSubmitToStoreCents: 2800, cashLargeFeeDividendCents: 4200, confirmedLargeFeeWageCents: 4200, confirmedIncomeCents: 4200 },
    records: [record("2026-11-13", "zero-tip", "11:00", "12:00", { cashServiceCents: 7000, employeeIncomeCents: 4200 })],
  },
  {
    ...base, businessDate: "2026-11-14", isClosed: true, activeClosing: { cycleNo: 1 },
    employee: { ...employee, grossFeeBaseCents: 10000, cardLargeFeeDividendCents: 6000, cardTipDividendCents: 3500, confirmedLargeFeeWageCents: 6000, confirmedTipWageCents: 3500, confirmedIncomeCents: 9500 },
    records: [record("2026-11-14", "card", "14:00", "15:30", { serviceShortName: "Body · 90 min", grossFeeBaseCents: 10000, cardServiceCents: 10000, cardTipCents: 3500, employeeIncomeCents: 9500 })],
  },
  {
    ...base, businessDate: "2026-11-15", isClosed: true, activeClosing: { cycleNo: 1 },
    employee: { ...employee, grossFeeBaseCents: 29500, cashToSubmitToStoreCents: 4400, cashLargeFeeDividendCents: 6600, cardLargeFeeDividendCents: 11100, cashTipDividendCents: 2500, cardTipDividendCents: 6300, confirmedLargeFeeWageCents: 17700, confirmedTipWageCents: 8800, confirmedIncomeCents: 26500 },
    records: [
      record("2026-11-15", "cash", "10:00", "11:00", { cashServiceCents: 7000, cashTipCents: 2500, employeeIncomeCents: 6700 }),
      record("2026-11-15", "card", "11:30", "13:00", { serviceShortName: "Body · 90 min", grossFeeBaseCents: 10000, cardServiceCents: 10000, cardTipCents: 3500, employeeIncomeCents: 9500 }),
      record("2026-11-15", "mixed", "14:00", "15:15", { addons: [{ shortName: "Hot stone", name: "Hot stone" }], isHighlighted: true, grossFeeBaseCents: 8500, cashServiceCents: 4000, cardServiceCents: 3000, giftCardServiceCents: 1500, giftCardTipCents: 1800, employeeIncomeCents: 6900 }),
      record("2026-11-15", "gift", "16:00", "16:30", { serviceName: "Foot massage", serviceShortName: "Foot · 30 min", grossFeeBaseCents: 4000, giftCardServiceCents: 4000, cardTipCents: 1000, employeeIncomeCents: 3400 }),
    ],
  },
  {
    ...base, businessDate: "2026-11-16", isClosed: false, activeClosing: null,
    employee: { ...employee, grossFeeBaseCents: 14000, cashToSubmitToStoreCents: 2550, cashLargeFeeDividendCents: 4200, cardLargeFeeDividendCents: 4200, cashTipDividendCents: 2000, cardTipDividendCents: 2000, confirmedLargeFeeWageCents: 8400, confirmedTipWageCents: 4000, confirmedIncomeCents: 12400 },
    records: [
      record("2026-11-16", "discount", "10:30", "11:30", { discountTotalCents: 250, cashServiceCents: 6750, cashTipCents: 2000, employeeIncomeCents: 6200 }),
      record("2026-11-16", "card", "12:00", "13:00", { cardServiceCents: 7000, cardTipCents: 2000, employeeIncomeCents: 6200 }),
      record("2026-11-16", "pending", "14:00", "15:00", { status: "PENDING", cashServiceCents: null, cardServiceCents: null, giftCardServiceCents: null, cashTipCents: null, cardTipCents: null, giftCardTipCents: null, employeeIncomeCents: null }),
    ],
  },
];

/** Synthetic preview aggregation only; real monthly earnings must be supplied by the API. */
export function getPreviewMonthToDate(businessDate: string): DailySnapshotMonthToDate {
  const dateFrom = `${businessDate.slice(0, 7)}-01`;
  const days = dailySnapshotFixtures.filter(snapshot => snapshot.businessDate >= dateFrom && snapshot.businessDate <= businessDate);
  return days.reduce<DailySnapshotMonthToDate>((total, { employee }) => ({
    ...total,
    cashIncomeCents: total.cashIncomeCents + employee.cashLargeFeeDividendCents + employee.cashTipDividendCents,
    nonCashIncomeCents: total.nonCashIncomeCents + employee.cardLargeFeeDividendCents + employee.cardTipDividendCents,
    totalIncomeCents: total.totalIncomeCents + employee.confirmedIncomeCents,
  }), { dateFrom, dateTo: businessDate, cashIncomeCents: 0, nonCashIncomeCents: 0, totalIncomeCents: 0 });
}
