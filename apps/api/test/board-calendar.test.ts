import { describe, expect, it, vi } from "vitest";
import type { User } from "@massage-note/database";
import { BoardsService } from "../src/boards/boards.service.js";
import type { PrismaService } from "../src/database/prisma.service.js";
import type { StoreAccessService } from "../src/stores/store-access.service.js";
import type { IdempotencyService } from "../src/common/idempotency.service.js";

function fixture(role: "OWNER" | "EMPLOYEE", closed = true) {
  const groupBy = vi.fn().mockResolvedValue([
    { businessDate: new Date("2026-09-10"), _sum: { discountedFeePerformanceCents: 94050n } },
    { businessDate: new Date("2026-09-12"), _sum: { discountedFeePerformanceCents: 10000n } },
  ]);
  const prisma = { giftCardSale: { groupBy: vi.fn().mockResolvedValue([]) }, workRecord: { groupBy }, businessDayClosing: {
    findMany: vi.fn().mockResolvedValue(closed ? [
      { businessDate: new Date("2026-09-10") },
      { businessDate: new Date("2026-09-11") },
    ] : []),
  } };
  const access = { requireActiveMembership: vi.fn().mockResolvedValue({ id: "member", role }) };
  const service = new BoardsService(prisma as unknown as PrismaService, access as unknown as StoreAccessService, {} as IdempotencyService);
  return { groupBy, prisma, read: () => service.openWorkDates({ id: "user" } as User, "store", { dateFrom: "2026-09-01", dateTo: "2026-09-30" }) };
}

describe("营业日日历折后营业额", () => {
  it("仅已日结日期显示金额，空日结为零，未日结保留圆点", async () => {
    const test = fixture("OWNER");
    expect(await test.read()).toEqual({ dates: ["2026-09-12"], closedDates: [
      { date: "2026-09-10", discountedFeePerformanceCents: 94050n, revenueCents: 94050n },
      { date: "2026-09-11", discountedFeePerformanceCents: 0n, revenueCents: 0n },
    ] });
    expect(test.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: "store", deletedAt: null, businessDate: { gte: new Date("2026-09-01"), lte: new Date("2026-09-30") } },
      _sum: { discountedFeePerformanceCents: true },
    }));
    expect(test.prisma.businessDayClosing.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "store", status: "CLOSED" }) }));
  });
  it("员工查询只汇总本人，不暴露其他日结日期或全店金额", async () => {
    const test = fixture("EMPLOYEE");
    expect((await test.read()).closedDates).toEqual([{ date: "2026-09-10", discountedFeePerformanceCents: 94050n, revenueCents: 94050n }]);
    expect(test.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ employeeMembershipId: "member" }) }));
  });
  it("取消日结后移除金额并恢复未日结圆点", async () => {
    expect(await fixture("OWNER", false).read()).toEqual({ dates: ["2026-09-10", "2026-09-12"], closedDates: [] });
  });
});

function averageFixture(role: "OWNER" | "MANAGER" | "EMPLOYEE" = "OWNER", closed = true) {
  const prisma = {
    store: { findFirst: vi.fn().mockResolvedValue({ timezone: "America/New_York", businessCutoffLocal: "22:00", nextGiftCardSerialNumber: 1 }) },
    dailyBoard: { findUnique: vi.fn().mockResolvedValue(null) },
    shift: { findMany: vi.fn().mockResolvedValue([]) },
    giftCardSale: { findMany: vi.fn().mockResolvedValue([]), groupBy: vi.fn().mockResolvedValue([]) },
    workRecord: {
      findMany: vi.fn().mockResolvedValue([{ discountedFeePerformanceCents: 94001n, grossFeeBaseCents: 94001n, discountTotalCents: 0n, totalLargeFeeWageCents: 0n, employee: { role: "OWNER" } }]),
      groupBy: vi.fn().mockResolvedValue([
        { businessDate: new Date("2026-09-12"), _sum: { discountedFeePerformanceCents: 94001n } },
        { businessDate: new Date("2026-09-11"), _sum: { discountedFeePerformanceCents: 999999n } },
      ]),
    },
    businessDayClosing: {
      findFirst: vi.fn().mockResolvedValue(closed ? { id: "closing" } : null),
      findMany: vi.fn().mockResolvedValue([
        { businessDate: new Date("2026-09-12") },
        { businessDate: new Date("2026-08-14") },
      ]),
    },
  };
  const access = { requireActiveMembership: vi.fn().mockResolvedValue({ id: "member", role }) };
  const service = new BoardsService(prisma as unknown as PrismaService, access as unknown as StoreAccessService, {} as IdempotencyService);
  return { prisma, read: () => service.getBoard({ id: "user" } as User, "store", "2026-09-12") };
}

describe("记工含当日平均营业额", () => {
  it.each(["OWNER", "MANAGER"] as const)("%s 按含所选日的30天窗口统计，此前仅纳入已日结日期，零营业额也计入", async role => {
    const test = averageFixture(role);
    expect((await test.read()).statistics.recentClosedRevenue).toEqual({ dayCount: 2, averageCents: 47001n });
    expect(test.prisma.businessDayClosing.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: "store", businessDate: { gte: new Date("2026-08-14"), lte: new Date("2026-09-12") }, status: "CLOSED" },
      distinct: ["businessDate"],
    }));
    expect(test.prisma.workRecord.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "store", deletedAt: null }) }));
    test.prisma.businessDayClosing.findMany.mockResolvedValue([{ businessDate: new Date("2026-09-12") }]);
    expect((await test.read()).statistics.recentClosedRevenue).toEqual({ dayCount: 1, averageCents: 94001n });
    test.prisma.businessDayClosing.findFirst.mockResolvedValue(null);
    expect((await test.read()).statistics.recentClosedRevenue).toBeNull();
  });
  it("数据库仅有当日日结时除以1，不补足30天", async () => {
    const test = averageFixture();
    test.prisma.businessDayClosing.findMany.mockResolvedValue([{ businessDate: new Date("2026-09-12") }]);
    expect((await test.read()).statistics.recentClosedRevenue).toEqual({ dayCount: 1, averageCents: 94001n });
  });
  it("窗口有30个日结日时当日仅计一次，缺一天日结就除以29", async () => {
    const test = averageFixture();
    const dates = Array.from({ length: 30 }, (_, index) => ({ businessDate: new Date(Date.UTC(2026, 7, 14 + index)) }));
    test.prisma.businessDayClosing.findMany.mockResolvedValue(dates);
    expect((await test.read()).statistics.recentClosedRevenue).toEqual({ dayCount: 30, averageCents: 36467n });
    test.prisma.businessDayClosing.findMany.mockResolvedValue(dates.filter(day => day.businessDate.toISOString().slice(0, 10) !== "2026-09-11"));
    expect((await test.read()).statistics.recentClosedRevenue).toEqual({ dayCount: 29, averageCents: 3241n });
  });
  it("当日为零营业额也计入平均值分母", async () => {
    const test = averageFixture();
    test.prisma.workRecord.findMany.mockResolvedValue([]);
    expect((await test.read()).statistics.recentClosedRevenue).toEqual({ dayCount: 2, averageCents: 0n });
  });
  it.each([["OWNER", false], ["MANAGER", false], ["EMPLOYEE", false], ["EMPLOYEE", true]] as const)("%s 日结状态 %s 不加载全店平均营业额", async (role, closed) => {
    const test = averageFixture(role, closed);
    expect((await test.read()).statistics.recentClosedRevenue).toBeNull();
    expect(test.prisma.workRecord.groupBy).not.toHaveBeenCalled();
  });
});

it("卖卡实收同时进入看板营业额和已日结平均值，收入不重复增加", async () => {
  const test = averageFixture();
  test.prisma.giftCardSale.findMany.mockResolvedValue([{ serialNumber: "1001", cashCents: 8000n, cardCents: 0n, amountCents: 8000n, faceValueCents: 10000n }] as never);
  test.prisma.giftCardSale.groupBy.mockResolvedValue([{ businessDate: new Date("2026-08-14"), _sum: { amountCents: 2000n } }] as never);
  expect((await test.read()).statistics).toMatchObject({
    discountedFeePerformanceCents: 94001n, revenueCents: 102001n,
    storeIncomeCents: 102001n, totalIncomeCents: 102001n,
    recentClosedRevenue: { dayCount: 2, averageCents: 52001n },
  });
});
it("日历包含只有卖卡的日结日，员工不查询卖卡数据", async () => {
  const test = fixture("OWNER");
  test.prisma.giftCardSale.groupBy.mockResolvedValue([{ businessDate: new Date("2026-09-11"), _sum: { amountCents: 8000n } }] as never);
  expect((await test.read()).closedDates[1]).toMatchObject({ discountedFeePerformanceCents: 0n, revenueCents: 8000n });
  expect(test.prisma.giftCardSale.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "store", deletedAt: null }) }));
  const employee = fixture("EMPLOYEE");
  await employee.read();
  expect(employee.prisma.giftCardSale.groupBy).not.toHaveBeenCalled();
});
