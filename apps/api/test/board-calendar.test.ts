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
  const prisma = { workRecord: { groupBy }, businessDayClosing: {
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
      { date: "2026-09-10", discountedFeePerformanceCents: 94050n },
      { date: "2026-09-11", discountedFeePerformanceCents: 0n },
    ] });
    expect(test.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { storeId: "store", deletedAt: null, businessDate: { gte: new Date("2026-09-01"), lte: new Date("2026-09-30") } },
      _sum: { discountedFeePerformanceCents: true },
    }));
    expect(test.prisma.businessDayClosing.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ storeId: "store", status: "CLOSED" }) }));
  });
  it("员工查询只汇总本人，不暴露其他日结日期或全店金额", async () => {
    const test = fixture("EMPLOYEE");
    expect((await test.read()).closedDates).toEqual([{ date: "2026-09-10", discountedFeePerformanceCents: 94050n }]);
    expect(test.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ employeeMembershipId: "member" }) }));
  });
  it("取消日结后移除金额并恢复未日结圆点", async () => {
    expect(await fixture("OWNER", false).read()).toEqual({ dates: ["2026-09-10", "2026-09-12"], closedDates: [] });
  });
});
