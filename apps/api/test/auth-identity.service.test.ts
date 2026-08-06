import { Prisma, type User } from "@massage-note/database";
import type { DecodedIdToken } from "firebase-admin/auth";
import { describe, expect, it, vi } from "vitest";
import { AuthIdentityService } from "../src/auth/auth-identity.service.js";
import type { PrismaService } from "../src/database/prisma.service.js";

function uniqueConflict(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError("唯一约束冲突", {
    code: "P2002",
    clientVersion: "test",
    meta: { target: ["firebase_uid"] },
  });
}

const activeUser = {
  id: "00000000-0000-4000-8000-000000000001",
  firebaseUid: "firebase-1",
  phoneE164: "+12125550123",
  passwordHash: null,
  firstName: null,
  lastName: null,
  status: "ACTIVE",
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies User;

const token = {
  uid: activeUser.firebaseUid,
  phone_number: activeUser.phoneE164,
} as DecodedIdToken;

describe("Firebase 身份同步", () => {
  it("首次并发登录遇到唯一约束竞争时重读已建立的用户", async () => {
    const transaction = {
      user: {
        findUnique: vi.fn().mockResolvedValueOnce(activeUser),
        update: vi.fn(),
        create: vi.fn(),
      },
    };
    const runTransaction = vi
      .fn()
      .mockRejectedValueOnce(uniqueConflict())
      .mockImplementationOnce(
        (callback: (client: typeof transaction) => Promise<User>) =>
          callback(transaction),
      );
    const service = new AuthIdentityService({
      $transaction: runTransaction,
    } as unknown as PrismaService, { hash: vi.fn(), verify: vi.fn() } as never);

    await expect(service.syncFromFirebase(token)).resolves.toEqual(activeUser);
    expect(runTransaction).toHaveBeenCalledTimes(2);
    expect(transaction.user.create).not.toHaveBeenCalled();
  });

  it("连续三次唯一约束失败后保留原始数据库错误", async () => {
    const error = uniqueConflict();
    const runTransaction = vi.fn().mockRejectedValue(error);
    const service = new AuthIdentityService({
      $transaction: runTransaction,
    } as unknown as PrismaService, { hash: vi.fn(), verify: vi.fn() } as never);

    await expect(service.syncFromFirebase(token)).rejects.toBe(error);
    expect(runTransaction).toHaveBeenCalledTimes(3);
  });
});
