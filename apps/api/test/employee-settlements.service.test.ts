import { describe, expect, it, vi } from "vitest";
import { EmployeeSettlementsService } from "../src/finance/employee-settlements.service.js";

const member = {
  id: "10000000-0000-4000-8000-000000000001",
  displayName: "Amy",
  store: { name: "Massage Note", timezone: "America/New_York" },
};

function record(index: number) {
  return {
    id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    businessDate: new Date("2026-08-20T00:00:00Z"),
    startAt: new Date(`2026-08-20T${String(index % 20).padStart(2, "0")}:00:00Z`),
    endAt: new Date(`2026-08-20T${String((index % 20) + 1).padStart(2, "0")}:00:00Z`),
    serviceSnapshot: { name: "Massage", shortName: "M" },
    addonSnapshots: [],
    grossFeeBaseCents: 10_000n,
    cashServiceCents: 4_000n,
    cardServiceCents: 6_000n,
    giftCardServiceCents: 0n,
    cashTipCents: 1_000n,
    cardTipCents: 2_000n,
    giftCardTipCents: 300n,
    totalLargeFeeWageCents: 6_000n,
    cashAllocatedServiceWageCents: 2_400n,
  };
}

function service(rows: ReturnType<typeof record>[]) {
  const prisma = {
    storeMembership: { findFirst: vi.fn().mockResolvedValue(member) },
    workRecord: { findMany: vi.fn().mockResolvedValue(rows) },
  };
  const access = { requireCapability: vi.fn().mockResolvedValue({ id: "manager" }) };
  return { value: new EmployeeSettlementsService(prisma as never, access as never), prisma };
}

const actor = { id: "30000000-0000-4000-8000-000000000001" } as never;
const storeId = "40000000-0000-4000-8000-000000000001";

describe("EmployeeSettlementsService preview", () => {
  it("按现金和非现金拆分混合付款工资", async () => {
    const { value, prisma } = service([record(1)]);
    const preview = await value.preview(actor, storeId, { membershipId: member.id, dateFrom: "2026-08-01", dateTo: "2026-08-31", paymentScope: "ALL" });
    expect(preview.summary).toMatchObject({ cashLargeFeeWageCents: 2400, nonCashLargeFeeWageCents: 3600, cashTipCents: 1000, nonCashTipCents: 2300, cashIncomeCents: 3400, nonCashIncomeCents: 5900, totalIncomeCents: 9300 });
    expect(prisma.workRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId, employeeMembershipId: member.id, status: "CONFIRMED", deletedAt: null }) }));
  });

  it("999 笔可以预览，第 1000 笔明确拒绝且不截断", async () => {
    const allowed = service(Array.from({ length: 999 }, (_, index) => record(index)));
    await expect(allowed.value.preview(actor, storeId, { membershipId: member.id, dateFrom: "2026-08-01", dateTo: "2026-08-31", paymentScope: "ALL" })).resolves.toMatchObject({ summary: { recordCount: 999 } });
    const refused = service(Array.from({ length: 1000 }, (_, index) => record(index)));
    await expect(refused.value.preview(actor, storeId, { membershipId: member.id, dateFrom: "2026-08-01", dateTo: "2026-08-31", paymentScope: "ALL" })).rejects.toMatchObject({ response: { code: "RECORD_LIMIT_EXCEEDED", latestResource: { recordCount: 1000, limit: 999 } } });
  });
});
