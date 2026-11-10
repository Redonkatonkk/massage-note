import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@massage-note/database";
import { readCashBalance } from "../src/boards/cash-balance.js";

const settings = { cashSettlementEnabled: true, cashSettlementCycle: "WEEKLY", cashResetWeekday: 1, cashResetMonthDay: 1, cashResetAmountCents: 20000n };
function fixture() {
  const client = {
    businessDayClosing: { findMany: vi.fn().mockResolvedValue([
      { businessDate: new Date("2026-11-09"), totalsSnapshotJson: { store: { cashChangeCents: 3501 } } },
      { businessDate: new Date("2026-11-11"), totalsSnapshotJson: { store: { cashChangeCents: -200 } } },
    ]) },
    workRecord: { findMany: vi.fn().mockResolvedValue([{ cashServiceCents: 5000n, cashAllocatedServiceWageCents: 3000n,
      totalLargeFeeWageCents: 6000n, cardTipCents: 501n, giftCardTipCents: 200n, employee: { role: "EMPLOYEE", dailySettlementEnabled: false } }]) },
    giftCardSale: { aggregate: vi.fn().mockResolvedValue({ _sum: { cashCents: 1501n } }) },
  };
  return { client, read: (options = settings) => readCashBalance(client as unknown as Prisma.TransactionClient, "store", "2026-11-11", options) };
}
describe("cash balance combines frozen closings and skipped days", () => {
  it("includes reset day and skipped-day confirmed receipts exactly once", async () => {
    const test = fixture();
    expect(await test.read()).toEqual({ enabled: true, resetDate: "2026-11-09", balanceCents: 26802, missingClosingDates: [] });
    expect(test.client.workRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {
      storeId: "store", deletedAt: null, status: "CONFIRMED", businessDate: {
        gte: new Date("2026-11-09"), lte: new Date("2026-11-11"), notIn: [new Date("2026-11-09"), new Date("2026-11-11")],
      },
    } }));
    expect(test.client.businessDayClosing.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "store", status: "CLOSED" }), distinct: ["businessDate"], orderBy: { cycleNo: "desc" } }));
    expect((await test.read({ ...settings, cashResetAmountCents: 10000n })).balanceCents).toBe(16802);
  });
  it("does not guess when a closed day's snapshot is missing or invalid", async () => {
    const test = fixture();
    test.client.businessDayClosing.findMany.mockResolvedValue([{ businessDate: new Date("2026-11-09"), totalsSnapshotJson: { store: {} } }]);
    expect(await test.read()).toMatchObject({ balanceCents: null, missingClosingDates: ["2026-11-09"] });
    expect(test.client.workRecord.findMany).not.toHaveBeenCalled();
  });
  it("counts empty days as zero and guards safe-number conversion", async () => {
    const test = fixture();
    test.client.businessDayClosing.findMany.mockResolvedValue([]);
    test.client.workRecord.findMany.mockResolvedValue([]);
    test.client.giftCardSale.aggregate.mockResolvedValue({ _sum: { cashCents: null } });
    expect((await test.read()).balanceCents).toBe(20000);
    test.client.giftCardSale.aggregate.mockResolvedValue({ _sum: { cashCents: 1n } });
    await expect(test.read({ ...settings, cashResetAmountCents: BigInt(Number.MAX_SAFE_INTEGER) })).rejects.toThrow("安全整数");
  });
});
