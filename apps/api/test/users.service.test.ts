import { UnauthorizedException } from "@nestjs/common";
import type { User } from "@massage-note/database";
import { describe, expect, it, vi } from "vitest";
import type { PasswordService } from "../src/auth/password.service.js";
import type { PrismaService } from "../src/database/prisma.service.js";
import { UsersService } from "../src/users/users.service.js";

const user = {
  id: "00000000-0000-4000-8000-000000000001",
  firebaseUid: "firebase-1",
  phoneE164: "+12125550123",
  passwordHash: null,
  firstName: "测试",
  lastName: "用户",
  status: "ACTIVE",
  createdAt: new Date(),
  updatedAt: new Date(),
} satisfies User;

function serviceFor(passwordHash: string | null, verifies = true) {
  const prisma = {
    user: {
      findUniqueOrThrow: vi.fn().mockResolvedValue({ passwordHash }),
      update: vi.fn().mockResolvedValue({}),
    },
  };
  const passwords = {
    verify: vi.fn().mockResolvedValue(verifies),
    hash: vi.fn().mockResolvedValue("new-hash"),
  };
  return {
    service: new UsersService(
      prisma as unknown as PrismaService,
      passwords as unknown as PasswordService,
    ),
    prisma,
    passwords,
  };
}

describe("个人密码", () => {
  it("个人资料只返回仍然有效的店铺成员关系", async () => {
    const { service, prisma } = serviceFor(null);

    await service.me(user.id);

    expect(prisma.user.findUniqueOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          memberships: expect.objectContaining({
            where: {
              status: "ACTIVE",
              deletedAt: null,
              store: { status: "ACTIVE", deletedAt: null },
            },
          }),
        }),
      }),
    );
  });

  it("允许验证码注册的老账号在登录后首次设置密码", async () => {
    const { service, prisma, passwords } = serviceFor(null);

    await expect(service.updatePassword(user, { newPassword: "new-pass-123" }))
      .resolves.toEqual({ hasPassword: true });
    expect(passwords.verify).not.toHaveBeenCalled();
    expect(passwords.hash).toHaveBeenCalledWith("new-pass-123");
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { passwordHash: "new-hash" },
    });
  });

  it("已有密码时拒绝错误的当前密码", async () => {
    const { service, prisma, passwords } = serviceFor("old-hash", false);

    await expect(service.updatePassword(user, {
      currentPassword: "wrong-pass",
      newPassword: "new-pass-123",
    })).rejects.toBeInstanceOf(UnauthorizedException);
    expect(passwords.verify).toHaveBeenCalledWith("wrong-pass", "old-hash");
    expect(passwords.hash).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it("已有密码且验证通过时更新密码", async () => {
    const { service, prisma } = serviceFor("old-hash", true);

    await expect(service.updatePassword(user, {
      currentPassword: "old-pass-123",
      newPassword: "new-pass-123",
    })).resolves.toEqual({ hasPassword: true });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { passwordHash: "new-hash" },
    });
  });
});
