import { randomBytes, timingSafeEqual } from "node:crypto";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { AuthIdentityService } from "./auth-identity.service.js";
import { sessionCookieName } from "./auth.constants.js";
import { parseCookieHeader } from "./cookie.js";
import { FirebaseAdminService } from "./firebase-admin.service.js";

const csrfCookieName = "massage_csrf";

interface CreateSessionBody {
  idToken?: unknown;
  csrfToken?: unknown;
  registration?: unknown;
  passwordSetup?: unknown;
}

interface CreateDevelopmentSessionBody {
  phoneE164?: unknown;
}

interface PhoneBody {
  phoneE164?: unknown;
}

interface PasswordLoginBody extends PhoneBody {
  password?: unknown;
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly firebase: FirebaseAdminService,
    private readonly identities: AuthIdentityService,
  ) {}

  @Post("account-status")
  accountStatus(@Body() body: PhoneBody): Promise<{ exists: boolean; hasPassword: boolean }> {
    return this.identities.accountStatus(this.validPhone(body.phoneE164));
  }

  @Post("password")
  async passwordLogin(@Body() body: PasswordLoginBody): Promise<{ customToken: string }> {
    const user = await this.identities.authenticatePassword(
      this.validPhone(body.phoneE164),
      this.validPassword(body.password),
    );
    return { customToken: await this.firebase.createCustomToken(user.firebaseUid) };
  }

  @Get("csrf")
  issueCsrf(@Res({ passthrough: true }) response: Response): { csrfToken: string } {
    const csrfToken = randomBytes(32).toString("base64url");
    response.cookie(csrfCookieName, csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 10 * 60 * 1_000,
    });
    return { csrfToken };
  }

  @Post("session")
  async createSession(
    @Body() body: CreateSessionBody,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ authenticated: true; uid: string }> {
    if (typeof body.idToken !== "string" || typeof body.csrfToken !== "string") {
      throw new BadRequestException({
        code: "INVALID_SESSION_REQUEST",
        messageZh: "登录请求不完整，请重试",
      });
    }

    const cookieCsrf = parseCookieHeader(request.headers.cookie).get(csrfCookieName);
    if (!cookieCsrf || !this.matchesToken(cookieCsrf, body.csrfToken)) {
      throw new BadRequestException({
        code: "CSRF_MISMATCH",
        messageZh: "登录页面已过期，请刷新后重试",
      });
    }

    const session = await this.firebase.createSession(body.idToken);
    const phoneE164 = session.decodedToken.phone_number;
    if (!phoneE164) {
      throw new BadRequestException({
        code: "PHONE_NUMBER_REQUIRED",
        messageZh: "此登录账号没有可验证的手机号码",
      });
    }
    const status = await this.identities.accountStatus(phoneE164);
    if (!status.exists) {
      const registration = this.validRegistration(body.registration);
      await this.identities.registerFromFirebase(session.decodedToken, registration);
    } else {
      const user = await this.identities.syncFromFirebase(session.decodedToken);
      if (!status.hasPassword) {
        const password = this.validPasswordSetup(body.passwordSetup);
        await this.identities.setInitialPassword(user.id, password);
      }
    }
    response.cookie(sessionCookieName, session.cookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: session.expiresInMs,
    });
    response.clearCookie(csrfCookieName, { path: "/" });

    return { authenticated: true, uid: session.decodedToken.uid };
  }

  @Post("dev-session")
  async createDevelopmentSession(
    @Body() body: CreateDevelopmentSessionBody,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ authenticated: true; developmentOnly: true }> {
    if (
      typeof body.phoneE164 !== "string" ||
      !/^\+[1-9]\d{7,14}$/.test(body.phoneE164)
    ) {
      throw new BadRequestException({
        code: "INVALID_PHONE_NUMBER",
        messageZh: "请输入有效的国际格式手机号码",
      });
    }
    const session = this.firebase.createDevelopmentSession(body.phoneE164);
    await this.identities.syncFromFirebase(session.decodedToken);
    response.cookie(sessionCookieName, session.cookie, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: session.expiresInMs,
    });
    return { authenticated: true, developmentOnly: true };
  }

  @Delete("session")
  clearSession(@Res({ passthrough: true }) response: Response): { authenticated: false } {
    response.clearCookie(sessionCookieName, { path: "/" });
    return { authenticated: false };
  }

  @Delete("sessions")
  async revokeAll(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ authenticated: false }> {
    const sessionCookie = parseCookieHeader(request.headers.cookie).get(sessionCookieName);
    if (sessionCookie) {
      const decoded = await this.firebase.verifySession(sessionCookie);
      await this.firebase.revokeAllSessions(decoded.uid);
    }
    response.clearCookie(sessionCookieName, { path: "/" });
    return { authenticated: false };
  }

  private matchesToken(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  }

  private validPhone(value: unknown): string {
    if (typeof value !== "string" || !/^\+[1-9]\d{7,14}$/.test(value)) {
      throw new BadRequestException({
        code: "INVALID_PHONE_NUMBER",
        messageZh: "请输入有效的国际格式手机号码",
      });
    }
    return value;
  }

  private validPassword(value: unknown): string {
    if (typeof value !== "string" || value.length < 8 || value.length > 72) {
      throw new BadRequestException({
        code: "INVALID_PASSWORD",
        messageZh: "密码必须为 8 至 72 个字符",
      });
    }
    return value;
  }

  private validRegistration(value: unknown): {
    firstName: string;
    lastName: string;
    password: string;
  } {
    const input = value as { firstName?: unknown; lastName?: unknown; password?: unknown } | null;
    const firstName = typeof input?.firstName === "string" ? input.firstName.trim() : "";
    const lastName = typeof input?.lastName === "string" ? input.lastName.trim() : "";
    if (!firstName || !lastName || firstName.length > 50 || lastName.length > 50) {
      throw new BadRequestException({
        code: "REGISTRATION_REQUIRED",
        messageZh: "首次注册需要填写姓名并设置密码",
      });
    }
    return { firstName, lastName, password: this.validPassword(input?.password) };
  }

  private validPasswordSetup(value: unknown): string {
    const input = value as { password?: unknown } | null;
    if (!input || !("password" in input)) {
      throw new BadRequestException({
        code: "PASSWORD_SETUP_REQUIRED",
        messageZh: "此老账号尚未设置密码，请先设置登录密码",
      });
    }
    return this.validPassword(input.password);
  }
}
