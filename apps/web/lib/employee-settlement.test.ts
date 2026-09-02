import { describe, expect, it } from "vitest";
import { groupEmployeeSettlementRecordsByDay } from "./employee-settlement";
import type { EmployeeSettlementRecord } from "./types";

function record(
  id: string,
  businessDate: string,
  startAt: string,
  amount: number,
): EmployeeSettlementRecord {
  return {
    id,
    businessDate,
    startAt,
    endAt: null,
    serviceName: "按摩",
    serviceShortName: "按摩",
    addons: [],
    grossFeeBaseCents: amount,
    cashServiceCents: amount,
    cardServiceCents: 0,
    giftCardServiceCents: 0,
    nonCashServiceCents: 0,
    cashLargeFeeWageCents: amount / 2,
    nonCashLargeFeeWageCents: 0,
    cashTipCents: 100,
    cardTipCents: 0,
    giftCardTipCents: 0,
    nonCashTipCents: 0,
    cashIncomeCents: amount / 2 + 100,
    nonCashIncomeCents: 0,
    totalIncomeCents: amount / 2 + 100,
  };
}

describe("groupEmployeeSettlementRecordsByDay", () => {
  it("按营业日和开始时间排列，并为每天计算独立小计", () => {
    const groups = groupEmployeeSettlementRecordsByDay([
      record("later", "2026-08-31", "2026-08-31T17:00:00.000Z", 10_000),
      record("previous", "2026-08-30", "2026-08-30T16:00:00.000Z", 8_000),
      record("earlier", "2026-08-31", "2026-08-31T14:00:00.000Z", 12_000),
    ]);

    expect(groups.map((group) => group.businessDate)).toEqual(["2026-08-30", "2026-08-31"]);
    expect(groups[1]?.records.map((item) => item.id)).toEqual(["earlier", "later"]);
    expect(groups[1]?.summary).toMatchObject({
      recordCount: 2,
      grossFeeBaseCents: 22_000,
      cashServiceCents: 22_000,
      cashLargeFeeWageCents: 11_000,
      cashTipCents: 200,
      cashIncomeCents: 11_200,
      totalIncomeCents: 11_200,
    });
  });

  it("空记录返回空的日期列表", () => {
    expect(groupEmployeeSettlementRecordsByDay([])).toEqual([]);
  });
});
