import { ForbiddenException } from "@nestjs/common";
import type { StoreMembership } from "@massage-note/database";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/database/prisma.service.js";
import { StoreAccessService } from "../src/stores/store-access.service.js";

const activeEmployee = {
  id: "00000000-0000-4000-8000-000000000001",
  role: "EMPLOYEE",
} as StoreMembership;

describe("店铺权限入口", () => {
  it("允许在职经理管理成员", async () => {
    const membership = { ...activeEmployee, role: "MANAGER" } as StoreMembership;
    const access = new StoreAccessService({
      storeMembership: { findFirst: vi.fn().mockResolvedValue(membership) },
    } as unknown as PrismaService);

    await expect(
      access.requireCapability("user-1", "store-1", "MEMBERSHIP_MANAGE"),
    ).resolves.toBe(membership);
  });

  it("拒绝普通员工执行成员管理", async () => {
    const access = new StoreAccessService({
      storeMembership: { findFirst: vi.fn().mockResolvedValue(activeEmployee) },
    } as unknown as PrismaService);

    await expect(
      access.requireCapability("user-1", "store-1", "MEMBERSHIP_MANAGE"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("没有本店在职成员关系时拒绝访问", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const access = new StoreAccessService({
      storeMembership: { findFirst },
    } as unknown as PrismaService);

    await expect(
      access.requireActiveMembership("other-store-user", "store-1"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: "store-1",
          userId: "other-store-user",
          status: "ACTIVE",
        }),
      }),
    );
  });
});
