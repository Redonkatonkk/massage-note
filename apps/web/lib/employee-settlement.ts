import type { EmployeeSettlementRecord } from "./types";

export interface EmployeeSettlementDaySummary {
  recordCount: number;
  grossFeeBaseCents: number;
  cashServiceCents: number;
  nonCashServiceCents: number;
  cashLargeFeeWageCents: number;
  nonCashLargeFeeWageCents: number;
  cashTipCents: number;
  nonCashTipCents: number;
  cashIncomeCents: number;
  nonCashIncomeCents: number;
  totalIncomeCents: number;
}

export interface EmployeeSettlementDayGroup {
  businessDate: string;
  records: EmployeeSettlementRecord[];
  summary: EmployeeSettlementDaySummary;
}

const summedFields = [
  "grossFeeBaseCents",
  "cashServiceCents",
  "nonCashServiceCents",
  "cashLargeFeeWageCents",
  "nonCashLargeFeeWageCents",
  "cashTipCents",
  "nonCashTipCents",
  "cashIncomeCents",
  "nonCashIncomeCents",
  "totalIncomeCents",
] as const satisfies ReadonlyArray<keyof EmployeeSettlementRecord>;

function emptySummary(): EmployeeSettlementDaySummary {
  return {
    recordCount: 0,
    grossFeeBaseCents: 0,
    cashServiceCents: 0,
    nonCashServiceCents: 0,
    cashLargeFeeWageCents: 0,
    nonCashLargeFeeWageCents: 0,
    cashTipCents: 0,
    nonCashTipCents: 0,
    cashIncomeCents: 0,
    nonCashIncomeCents: 0,
    totalIncomeCents: 0,
  };
}

export function groupEmployeeSettlementRecordsByDay(
  records: EmployeeSettlementRecord[],
): EmployeeSettlementDayGroup[] {
  const groups = new Map<string, EmployeeSettlementDayGroup>();
  const orderedRecords = [...records].sort((left, right) => (
    left.businessDate.localeCompare(right.businessDate)
    || left.startAt.localeCompare(right.startAt)
    || left.id.localeCompare(right.id)
  ));

  for (const record of orderedRecords) {
    let group = groups.get(record.businessDate);
    if (!group) {
      group = {
        businessDate: record.businessDate,
        records: [],
        summary: emptySummary(),
      };
      groups.set(record.businessDate, group);
    }

    group.records.push(record);
    group.summary.recordCount += 1;
    for (const field of summedFields) {
      group.summary[field] += record[field];
    }
  }

  return [...groups.values()];
}
