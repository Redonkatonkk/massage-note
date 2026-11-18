import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@massage-note/database";
import { readCashBalance } from "../src/boards/cash-balance.js";

const settings = { cashSettlementEnabled: true, cashSettlementCycle: "WEEKLY", cashResetWeekday: 1, cashResetMonthDay: 1, cashResetAmountCents: 20000n };
function fixture() {
  const client = {
    workRecord: { aggregate: vi.fn().mockResolvedValue({ _sum: { cashServiceCents: 10000n } }) },
    giftCardSale: { aggregate: vi.fn().mockResolvedValue({ _sum: { cashCents: 1501n } }) },
    dailyCashSettlement: { findMany: vi.fn().mockResolvedValue([]) },
  };
  return { client, read: (options = settings) => readCashBalance(client as unknown as Prisma.TransactionClient, "store", "2026-11-11", options) };
}

describe("cash balance", () => {
  it("includes confirmed receipts and only posted employee payouts within the inclusive reset period", async () => {
    const test = fixture();
    expect(await test.read()).toEqual({ enabled: true, resetDate: "2026-11-09", balanceCents: 31501, missingClosingDates: [] });
    const scope = { storeId: "store", deletedAt: null, businessDate: {
      gte: new Date("2026-11-09"), lte: new Date("2026-11-11"),
    } };
    expect(test.client.workRecord.aggregate).toHaveBeenCalledWith({ where: { ...scope, status: "CONFIRMED" }, _sum: { cashServiceCents: true } });
    expect(test.client.giftCardSale.aggregate).toHaveBeenCalledWith({ where: scope, _sum: { cashCents: true } });
    expect(test.client.dailyCashSettlement.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { ...scope, status: "SETTLED", membership: { role: "EMPLOYEE" } },
    }));
    test.client.dailyCashSettlement.findMany.mockResolvedValue([
      { dailySettlementEnabled: false, cashAcquiredServiceWageCents: 1000n },
      { dailySettlementEnabled: true, cashAcquiredServiceWageCents: 3000n, additionalServiceWagePaidCents: 3000n, nonCashTipPaidCents: 701n },
    ]);
    expect((await test.read()).balanceCents).toBe(23800);
  });

  it("counts empty days as zero and guards safe-number conversion", async () => {
    const test = fixture();
    test.client.workRecord.aggregate.mockResolvedValue({ _sum: { cashServiceCents: null } });
    test.client.giftCardSale.aggregate.mockResolvedValue({ _sum: { cashCents: null } });
    expect((await test.read()).balanceCents).toBe(20000);
    test.client.giftCardSale.aggregate.mockResolvedValue({ _sum: { cashCents: 1n } });
    await expect(test.read({ ...settings, cashResetAmountCents: BigInt(Number.MAX_SAFE_INTEGER) })).rejects.toThrow("安全整数");
  });
});
