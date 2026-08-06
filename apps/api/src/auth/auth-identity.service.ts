import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Prisma, type User } from "@massage-note/database";
import type { DecodedIdToken } from "firebase-admin/auth";
import { PrismaService } from "../database/prisma.service.js";
import { PasswordService } from "./password.service.js";

interface RegistrationInput {
  firstName: string;
  lastName: string;
  password: string;
}

@Injectable()
export class AuthIdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async accountStatus(phoneE164: string): Promise<{ exists: boolean; hasPassword: boolean }> {
    const user = await this.prisma.user.findUnique({
      where: { phoneE164 },
      select: { passwordHash: true },
    });
    return { exists: Boolean(user), hasPassword: Boolean(user?.passwordHash) };
  }

  async authenticatePassword(phoneE164: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { phoneE164 } });
    if (!user || !user.passwordHash || !(await this.passwords.verify(password, user.passwordHash))) {
      throw new UnauthorizedException({
        code: "INVALID_PHONE_OR_PASSWORD",
        messageZh: "手机号码或密码不正确",
      });
    }
    if (user.status === "DISABLED") this.throwDisabled();
    return user;
  }

  async registerFromFirebase(token: DecodedIdToken, input: RegistrationInput): Promise<User> {
    const phoneE164 = this.phoneFromToken(token);
    const passwordHash = await this.passwords.hash(input.password);
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const [byUid, byPhone] = await Promise.all([
          transaction.user.findUnique({ where: { firebaseUid: token.uid } }),
          transaction.user.findUnique({ where: { phoneE164 } }),
        ]);
        const existing = byUid ?? byPhone;
        if (existing) {
          if (existing.status === "DISABLED") this.throwDisabled();
          if (
            existing.firebaseUid === token.uid &&
            existing.phoneE164 === phoneE164 &&
            existing.firstName === input.firstName &&
            existing.lastName === input.lastName &&
            existing.passwordHash &&
            await this.passwords.verify(input.password, existing.passwordHash)
          ) return existing;
          throw new ConflictException({
            code: "ACCOUNT_ALREADY_EXISTS",
            messageZh: "此手机号码已经注册，请返回使用密码或验证码登录",
          });
        }
        return transaction.user.create({
          data: {
            firebaseUid: token.uid,
            phoneE164,
            firstName: input.firstName,
            lastName: input.lastName,
            passwordHash,
          },
        });
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) {
        throw new ConflictException({
          code: "ACCOUNT_ALREADY_EXISTS",
          messageZh: "此手机号码已经注册，请返回使用密码或验证码登录",
        });
      }
      throw error;
    }
  }

  async setInitialPassword(userId: string, password: string): Promise<User> {
    const current = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (current.passwordHash) {
      if (await this.passwords.verify(password, current.passwordHash)) return current;
      throw new ConflictException({
        code: "PASSWORD_ALREADY_SET",
        messageZh: "此账号已经设置密码，请直接使用密码登录",
      });
    }
    const passwordHash = await this.passwords.hash(password);
    const updated = await this.prisma.user.updateMany({
      where: { id: userId, passwordHash: null },
      data: { passwordHash },
    });
    const latest = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (updated.count === 1 || (latest.passwordHash && await this.passwords.verify(password, latest.passwordHash))) {
      return latest;
    }
    throw new ConflictException({
      code: "PASSWORD_ALREADY_SET",
      messageZh: "此账号已经设置密码，请直接使用密码登录",
    });
  }

  async syncFromFirebase(token: DecodedIdToken): Promise<User> {
    const phoneE164 = this.phoneFromToken(token);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.syncIdentity(token.uid, phoneE164);
      } catch (error) {
        if (!this.isUniqueConflict(error) || attempt === 2) throw error;
      }
    }

    throw new Error("身份同步重试次数已耗尽");
  }

  private async syncIdentity(firebaseUid: string, phoneE164: string): Promise<User> {
    return this.prisma.$transaction(async (transaction) => {
      const byUid = await transaction.user.findUnique({
        where: { firebaseUid },
      });
      if (byUid) {
        if (byUid.status === "DISABLED") this.throwDisabled();
        if (byUid.phoneE164 === phoneE164) return byUid;

        const phoneOwner = await transaction.user.findUnique({
          where: { phoneE164 },
        });
        if (phoneOwner && phoneOwner.id !== byUid.id) this.throwPhoneConflict();
        return transaction.user.update({
          where: { id: byUid.id },
          data: { phoneE164 },
        });
      }

      const byPhone = await transaction.user.findUnique({ where: { phoneE164 } });
      if (byPhone) {
        if (byPhone.status === "DISABLED") this.throwDisabled();
        if (byPhone.firebaseUid === firebaseUid) return byPhone;
        return transaction.user.update({
          where: { id: byPhone.id },
          data: { firebaseUid },
        });
      }

      return transaction.user.create({
        data: { firebaseUid, phoneE164 },
      });
    });
  }

  async findActiveByFirebaseUid(firebaseUid: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { firebaseUid } });
    if (!user) {
      throw new UnauthorizedException({
        code: "ACCOUNT_NOT_INITIALIZED",
        messageZh: "账号资料尚未建立，请重新登录",
      });
    }
    if (user.status === "DISABLED") this.throwDisabled();
    return user;
  }

  private throwDisabled(): never {
    throw new ForbiddenException({
      code: "ACCOUNT_DISABLED",
      messageZh: "此账号已停用，请联系系统管理员",
    });
  }

  private throwPhoneConflict(): never {
    throw new ConflictException({
      code: "PHONE_ACCOUNT_CONFLICT",
      messageZh: "此手机号码已关联其他账号，请联系系统管理员",
    });
  }

  private isUniqueConflict(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }

  private phoneFromToken(token: DecodedIdToken): string {
    const phoneE164 = token.phone_number;
    if (!phoneE164 || !/^\+[1-9]\d{7,14}$/.test(phoneE164)) {
      throw new UnauthorizedException({
        code: "PHONE_NUMBER_REQUIRED",
        messageZh: "此登录账号没有可验证的手机号码",
      });
    }
    return phoneE164;
  }
}
