import { Injectable, UnauthorizedException } from "@nestjs/common";
import type { UpdatePasswordInput } from "@massage-note/contracts";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { PasswordService } from "../auth/password.service.js";
import { PrismaService } from "../database/prisma.service.js";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async me(userId: string) {
    const result = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        phoneE164: true,
        firstName: true,
        lastName: true,
        status: true,
        passwordHash: true,
        memberships: {
          where: {
            status: "ACTIVE",
            deletedAt: null,
            store: { status: "ACTIVE", deletedAt: null },
          },
          orderBy: { joinedAt: "asc" },
          select: {
            id: true,
            role: true,
            displayName: true,
            isServiceProvider: true,
            store: {
              select: {
                id: true,
                storeCode: true,
                name: true,
                timezone: true,
                businessCutoffLocal: true,
                status: true,
              },
            },
          },
        },
      },
    });
    const { passwordHash, ...profile } = result;
    return { ...profile, hasPassword: Boolean(passwordHash) };
  }

  async updateProfile(
    user: AuthenticatedUser,
    input: { firstName: string; lastName: string },
  ) {
    return this.prisma.user.update({
      where: { id: user.id },
      data: input,
      select: {
        id: true,
        phoneE164: true,
        firstName: true,
        lastName: true,
        status: true,
        updatedAt: true,
      },
    });
  }

  async updatePassword(
    user: AuthenticatedUser,
    input: UpdatePasswordInput,
  ): Promise<{ hasPassword: true }> {
    const current = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (current.passwordHash) {
      if (
        !input.currentPassword ||
        !(await this.passwords.verify(input.currentPassword, current.passwordHash))
      ) {
        throw new UnauthorizedException({
          code: "INVALID_CURRENT_PASSWORD",
          messageZh: "当前密码不正确",
        });
      }
    }
    const passwordHash = await this.passwords.hash(input.newPassword);
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    });
    return { hasPassword: true };
  }
}
