import { Prisma, type User } from "@massage-note/database";
import { ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/database/prisma.service.js";
import { StoresService } from "../src/stores/stores.service.js";

function uniqueConflict(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("唯一约束冲突", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: ["store_id", "user_id"] },
  });
}

function storeCodeConflict(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("店铺代码唯一约束冲突", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: ["store_code"] },
  });
}

describe("创建店铺", () => {
  const user = {
    id: "00000000-0000-4000-8000-000000000101",
    firstName: "测试",
    lastName: "店主",
  } as User;
  const input = {
    storeCode: "120034",
    name: "测试新店",
    timezone: "America/New_York",
    businessCutoffLocal: "22:00",
    globalCommissionBps: 5_000,
  };

  it("完整保留店主输入的 6 位代码并创建店主关系", async () => {
    const store = { id: "00000000-0000-4000-8000-000000000111", ...input, version: 1 };
    const membership = {
      id: "00000000-0000-4000-8000-000000000112",
      storeId: store.id,
      userId: user.id,
      role: "OWNER",
      displayName: "测试 店主",
    };
    const storeCreate = vi.fn().mockResolvedValue(store);
    const membershipCreate = vi.fn().mockResolvedValue(membership);
    const storeUpdate = vi.fn().mockResolvedValue({
      ...store,
      ownerMembershipId: membership.id,
    });
    const auditCreate = vi.fn().mockResolvedValue({});
    const transaction = {
      store: { create: storeCreate, update: storeUpdate },
      storeMembership: { create: membershipCreate },
      auditLog: { create: auditCreate },
    };
    const service = new StoresService({
      $transaction: vi.fn(async (callback) => callback(transaction)),
    } as unknown as PrismaService);

    const result = await service.create(user, input, "create-store-request");

    expect(result.store.storeCode).toBe("120034");
    expect(storeCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ storeCode: "120034" }) }),
    );
    expect(membershipCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ role: "OWNER", isServiceProvider: true }),
      }),
    );
    expect(auditCreate).toHaveBeenCalledOnce();
  });

  it("重复代码返回明确的中文冲突，而不是静默换号", async () => {
    const service = new StoresService({
      $transaction: vi.fn().mockRejectedValue(storeCodeConflict()),
      store: { findFirst: vi.fn().mockResolvedValue(null) },
    } as unknown as PrismaService);

    await expect(service.create(user, input, "duplicate-store-request")).rejects.toMatchObject({
      response: expect.objectContaining({
        code: "STORE_CODE_TAKEN",
        messageZh: "这个 6 位店铺代码已被使用，请换一个代码",
      }),
    });
    await expect(service.create(user, input, "duplicate-store-request-2")).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("同一店主的同内容重试返回首次创建结果", async () => {
    const existingStore = {
      id: "00000000-0000-4000-8000-000000000121",
      ...input,
      status: "ACTIVE",
      deletedAt: null,
      ownerMembershipId: "00000000-0000-4000-8000-000000000122",
      version: 1,
    };
    const existingMembership = {
      id: existingStore.ownerMembershipId,
      storeId: existingStore.id,
      userId: user.id,
      role: "OWNER",
      status: "ACTIVE",
      deletedAt: null,
    };
    const service = new StoresService({
      $transaction: vi.fn().mockRejectedValue(storeCodeConflict()),
      store: { findFirst: vi.fn().mockResolvedValue(existingStore) },
      storeMembership: { findFirst: vi.fn().mockResolvedValue(existingMembership) },
    } as unknown as PrismaService);

    await expect(service.create(user, input, "replayed-create-request")).resolves.toEqual({
      store: existingStore,
      membership: existingMembership,
    });
  });
});

describe("用户店铺列表", () => {
  it("只查询仍在营业的店铺，软删除店铺不会留在切换列表", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const service = new StoresService({
      storeMembership: { findMany },
    } as unknown as PrismaService);

    await expect(
      service.listForUser("00000000-0000-4000-8000-000000000201"),
    ).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "ACTIVE",
          deletedAt: null,
          store: { status: "ACTIVE", deletedAt: null },
        }),
      }),
    );
  });
});

describe("加入店铺申请", () => {
  it("并发重复提交时返回已经创建的待审核申请", async () => {
    const user = {
      id: "00000000-0000-4000-8000-000000000001",
    } as User;
    const pending = {
      id: "00000000-0000-4000-8000-000000000011",
      storeId: "00000000-0000-4000-8000-000000000021",
      userId: user.id,
      requestedDisplayName: "小林",
      status: "PENDING",
      reviewedBy: null,
      reviewedAt: null,
      reviewNote: null,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as const;
    const findFirst = vi
      .fn()
      .mockResolvedValueOnce({ id: pending.storeId })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(pending);
    const service = new StoresService({
      store: { findFirst },
      storeMembership: { findFirst },
      storeJoinRequest: { findFirst },
      $transaction: vi.fn().mockRejectedValue(uniqueConflict()),
    } as unknown as PrismaService);

    await expect(
      service.requestToJoin(
        user,
        pending.storeId,
        { displayName: "小林" },
        "request-1",
      ),
    ).resolves.toEqual(pending);
    expect(findFirst).toHaveBeenCalledTimes(4);
  });
});
