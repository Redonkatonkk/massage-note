import {
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";

const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1_000;

@Injectable()
export class FirebaseAdminService {
  developmentAuthEnabled(): boolean {
    return (
      process.env.NODE_ENV !== "production" &&
      process.env.DEV_AUTH_ENABLED === "true"
    );
  }

  private app(): App {
    const existing = getApps()[0];
    if (existing) return existing;

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (projectId && clientEmail && privateKey) {
      return initializeApp({
        credential: cert({ projectId, clientEmail, privateKey }),
        projectId,
      });
    }

    if (projectId) {
      return initializeApp({ credential: applicationDefault(), projectId });
    }

    throw new ServiceUnavailableException({
      code: "FIREBASE_NOT_CONFIGURED",
      messageZh: "手机登录尚未配置，请联系系统管理员",
    });
  }

  async createSession(idToken: string): Promise<{
    cookie: string;
    decodedToken: DecodedIdToken;
    expiresInMs: number;
  }> {
    try {
      const auth = getAuth(this.app());
      const decodedToken = await auth.verifyIdToken(idToken, true);
      const cookie = await auth.createSessionCookie(idToken, {
        expiresIn: SESSION_DURATION_MS,
      });
      return { cookie, decodedToken, expiresInMs: SESSION_DURATION_MS };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new UnauthorizedException({
        code: "INVALID_FIREBASE_TOKEN",
        messageZh: "验证码登录已失效，请重新登录",
      });
    }
  }

  async createCustomToken(uid: string): Promise<string> {
    try {
      return await getAuth(this.app()).createCustomToken(uid);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException({
        code: "PASSWORD_LOGIN_UNAVAILABLE",
        messageZh: "密码登录暂时不可用，请改用验证码登录",
      });
    }
  }

  createDevelopmentSession(phoneE164: string): {
    cookie: string;
    decodedToken: DecodedIdToken;
    expiresInMs: number;
  } {
    if (!this.developmentAuthEnabled()) {
      throw new NotFoundException({
        code: "DEV_AUTH_DISABLED",
        messageZh: "本地测试登录未启用",
      });
    }
    const now = Math.floor(Date.now() / 1_000);
    const expiresAt = now + Math.floor(SESSION_DURATION_MS / 1_000);
    const uid = `dev-${createHash("sha256").update(phoneE164).digest("hex").slice(0, 32)}`;
    const decodedToken = {
      uid,
      sub: uid,
      phone_number: phoneE164,
      iat: now,
      exp: expiresAt,
      auth_time: now,
      aud: "local-development",
      iss: "local-development",
      firebase: { identities: {}, sign_in_provider: "custom" },
    } as unknown as DecodedIdToken;
    const payload = Buffer.from(
      JSON.stringify({ uid, phone_number: phoneE164, iat: now, exp: expiresAt }),
    ).toString("base64url");
    const signature = this.signDevelopmentPayload(payload);
    return {
      cookie: `dev.${payload}.${signature}`,
      decodedToken,
      expiresInMs: SESSION_DURATION_MS,
    };
  }

  async verifySession(cookie: string): Promise<DecodedIdToken> {
    if (cookie.startsWith("dev.")) return this.verifyDevelopmentSession(cookie);
    try {
      return await getAuth(this.app()).verifySessionCookie(cookie, true);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new UnauthorizedException({
        code: "INVALID_SESSION",
        messageZh: "登录已过期，请重新登录",
      });
    }
  }

  async revokeAllSessions(uid: string): Promise<void> {
    if (uid.startsWith("dev-") && this.developmentAuthEnabled()) return;
    await getAuth(this.app()).revokeRefreshTokens(uid);
  }

  private verifyDevelopmentSession(cookie: string): DecodedIdToken {
    if (!this.developmentAuthEnabled()) this.throwInvalidDevelopmentSession();
    const [, payload, signature] = cookie.split(".");
    if (!payload || !signature) this.throwInvalidDevelopmentSession();
    const expected = this.signDevelopmentPayload(payload);
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      this.throwInvalidDevelopmentSession();
    }
    try {
      const value = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
        uid?: unknown;
        phone_number?: unknown;
        iat?: unknown;
        exp?: unknown;
      };
      if (
        typeof value.uid !== "string" ||
        !value.uid.startsWith("dev-") ||
        typeof value.phone_number !== "string" ||
        !/^\+[1-9]\d{7,14}$/.test(value.phone_number) ||
        typeof value.iat !== "number" ||
        typeof value.exp !== "number" ||
        value.exp <= Math.floor(Date.now() / 1_000)
      ) {
        this.throwInvalidDevelopmentSession();
      }
      return {
        ...value,
        uid: value.uid,
        sub: value.uid,
        auth_time: value.iat,
        aud: "local-development",
        iss: "local-development",
        firebase: { identities: {}, sign_in_provider: "custom" },
      } as unknown as DecodedIdToken;
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      this.throwInvalidDevelopmentSession();
    }
  }

  private signDevelopmentPayload(payload: string): string {
    const secret = process.env.DEV_AUTH_SECRET;
    if (!secret || secret.length < 32) {
      throw new ServiceUnavailableException({
        code: "DEV_AUTH_SECRET_INVALID",
        messageZh: "本地测试登录密钥未配置或长度不足",
      });
    }
    return createHmac("sha256", secret).update(payload).digest("base64url");
  }

  private throwInvalidDevelopmentSession(): never {
    throw new UnauthorizedException({
      code: "INVALID_DEV_SESSION",
      messageZh: "本地测试登录已过期，请重新登录",
    });
  }
}
