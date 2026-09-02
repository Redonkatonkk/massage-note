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
  return { value: new EmployeeSettlementsService(prisma as never, access as never, {} as never), prisma };
}

const actor = { id: "30000000-0000-4000-8000-000000000001" } as never;
const storeId = "40000000-0000-4000-8000-000000000001";

describe("EmployeeSettlementsService preview", () => {
  it("按现金和非现金拆分混合付款工资", async () => {
    const { value, prisma } = service([record(1)]);
    const preview = await value.preview(actor, storeId, { membershipId: member.id, dateFrom: "2026-08-01", dateTo: "2026-08-31", paymentScope: "ALL" });
    expect(preview.summary).toMatchObject({ cashLargeFeeWageCents: 2400, nonCashLargeFeeWageCents: 3600, cashTipCents: 1000, nonCashTipCents: 2300, cashIncomeCents: 3400, nonCashIncomeCents: 5900, totalIncomeCents: 9300 });
    expect(preview.records[0]).toMatchObject({ cardServiceCents: 6000, giftCardServiceCents: 0, cardTipCents: 2000, giftCardTipCents: 300 });
    expect(prisma.workRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId, employeeMembershipId: member.id, status: "CONFIRMED", deletedAt: null }) }));
  });

  it("非现金结算纳入大费或小费含非现金的记录且只计算非现金部分", async () => {
    const cashServiceCardTip = { ...record(1), cashServiceCents: 10_000n, cardServiceCents: 0n, cashAllocatedServiceWageCents: 6_000n, cashTipCents: 0n, cardTipCents: 2_000n, giftCardTipCents: 0n };
    const cardServiceCashTip = { ...record(2), cashServiceCents: 0n, cardServiceCents: 10_000n, cashAllocatedServiceWageCents: 0n, cashTipCents: 1_000n, cardTipCents: 0n, giftCardTipCents: 0n };
    const splitService = { ...record(3), cashServiceCents: 5_000n, cardServiceCents: 0n, giftCardServiceCents: 5_000n, cashAllocatedServiceWageCents: 3_000n, cashTipCents: 0n, cardTipCents: 0n, giftCardTipCents: 0n };
    const cashOnly = { ...record(4), cashServiceCents: 10_000n, cardServiceCents: 0n, giftCardServiceCents: 0n, cashAllocatedServiceWageCents: 6_000n, cashTipCents: 1_000n, cardTipCents: 0n, giftCardTipCents: 0n };
    const { value } = service([cashServiceCardTip, cardServiceCashTip, splitService, cashOnly]);
    const preview = await value.preview(actor, storeId, { membershipId: member.id, dateFrom: "2026-08-01", dateTo: "2026-08-31", paymentScope: "NON_CASH" });
    expect(preview.records.map((item) => item.id)).toEqual([cashServiceCardTip.id, cardServiceCashTip.id, splitService.id]);
    expect(preview.summary).toMatchObject({ recordCount: 3, nonCashLargeFeeWageCents: 9_000, nonCashTipCents: 2_000, nonCashIncomeCents: 11_000, totalIncomeCents: 11_000 });
    expect(preview.records[0]).toMatchObject({ nonCashLargeFeeWageCents: 0, nonCashTipCents: 2_000, nonCashIncomeCents: 2_000 });
    expect(preview.records[1]).toMatchObject({ nonCashLargeFeeWageCents: 6_000, nonCashTipCents: 0, nonCashIncomeCents: 6_000 });
  });

  it("店主或经理作为在职服务成员时也可以生成区间结算", async () => {
    const { value, prisma } = service([record(1)]);
    await expect(value.preview(actor, storeId, { membershipId: member.id, dateFrom: "2026-08-01", dateTo: "2026-08-31", paymentScope: "ALL" })).resolves.toMatchObject({ employee: { membershipId: member.id } });
    const membershipWhere = prisma.storeMembership.findFirst.mock.calls[0]?.[0]?.where;
    expect(membershipWhere).not.toHaveProperty("role");
    expect(membershipWhere).toMatchObject({ id: member.id, storeId, status: "ACTIVE", deletedAt: null });
  });

  it("999 笔可以预览，第 1000 笔明确拒绝且不截断", async () => {
    const allowed = service(Array.from({ length: 999 }, (_, index) => record(index)));
    await expect(allowed.value.preview(actor, storeId, { membershipId: member.id, dateFrom: "2026-08-01", dateTo: "2026-08-31", paymentScope: "ALL" })).resolves.toMatchObject({ summary: { recordCount: 999 } });
    const refused = service(Array.from({ length: 1000 }, (_, index) => record(index)));
    await expect(refused.value.preview(actor, storeId, { membershipId: member.id, dateFrom: "2026-08-01", dateTo: "2026-08-31", paymentScope: "ALL" })).rejects.toMatchObject({ response: { code: "RECORD_LIMIT_EXCEEDED", latestResource: { recordCount: 1000, limit: 999 } } });
  });
});

describe("EmployeeSettlementsService long-image redelivery", () => {
  it("重发单张长图不依赖旧摘要检查点", async () => {
    const prisma = {
      closingDeliveryAgent: {
        findUnique: vi.fn().mockResolvedValue({
          revokedAt: null,
          lastSeenAt: new Date(),
          lastStatusJson: { messagesAvailable: true },
        }),
      },
      employeeSettlementDelivery: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue({ id: "delivery" }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const access = { requireCapability: vi.fn().mockResolvedValue({ id: "manager" }) };
    const value = new EmployeeSettlementsService(prisma as never, access as never, {} as never);

    await expect(value.retryDetail(actor, storeId, "50000000-0000-4000-8000-000000000001", "request-id")).resolves.toEqual({ id: "delivery" });
    expect(prisma.employeeSettlementDelivery.updateMany).toHaveBeenCalledWith({
      where: {
        id: "50000000-0000-4000-8000-000000000001",
        storeId,
        status: { in: ["SENT", "FAILED"] },
      },
      data: expect.objectContaining({
        status: "QUEUED",
        detailSentAt: null,
        sentAt: null,
      }),
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "employee_settlement.delivery_detail_retried" }) }));
  });
});

describe("EmployeeSettlementsService employee-summary delivery", () => {
  it("把保留美分的员工卡片汇总发送到指定号码", async () => {
    const created = { id: "50000000-0000-4000-8000-000000000001" };
    const prisma = {
      employeeSettlementDelivery: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(created),
      },
      closingDeliveryAgent: {
        findUnique: vi.fn().mockResolvedValue({ revokedAt: null, lastSeenAt: new Date(), lastStatusJson: { messagesAvailable: true } }),
      },
      store: {
        findFirst: vi.fn().mockResolvedValue({ name: "Massage Note", timezone: "America/New_York", closingDefaultLocale: "zh_CN" }),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    };
    const access = { requireCapability: vi.fn().mockResolvedValue({ id: "60000000-0000-4000-8000-000000000001" }) };
    const financeQueries = {
      summary: vi.fn().mockResolvedValue({
        filters: { dateFrom: "2026-09-01", dateTo: "2026-09-02", membershipIds: [member.id], paymentMethod: "ALL", amountType: "ALL", highlightFilter: "ALL" },
        employees: [{ membershipId: member.id, displayName: "Amy", role: "EMPLOYEE", recordCount: 2, mainServiceAmountCents: 10_050n, addonTotalCents: 1_025n, grossFeeBaseCents: 11_075n, totalTipCents: 2_055n, totalLargeFeeWageCents: 6_701n, employeeIncomeCents: 8_756n }],
      }),
    };
    const value = new EmployeeSettlementsService(prisma as never, access as never, financeQueries as never);

    await expect(value.queueEmployeeSummary(actor, storeId, {
      dateFrom: "2026-09-01", dateTo: "2026-09-02", membershipIds: [member.id], paymentMethod: "ALL", amountType: "ALL", highlightFilter: "ALL", recipientPhoneE164: "+16465551234",
    }, "request-key", "request-id")).resolves.toEqual(created);

    expect(prisma.employeeSettlementDelivery.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        documentType: "EMPLOYEE_SUMMARY",
        membershipId: null,
        recipientPhoneE164: "+16465551234",
        snapshotJson: expect.objectContaining({
          documentType: "EMPLOYEE_SUMMARY",
          employees: [expect.objectContaining({ mainServiceAmountCents: 10_050, addonTotalCents: 1_025, totalLargeFeeWageCents: 6_701, employeeIncomeCents: 8_756 })],
        }),
      }),
    });
  });
});
