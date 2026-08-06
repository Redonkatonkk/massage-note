import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { parseCookieHeader } from "./cookie.js";
import { FirebaseAdminService } from "./firebase-admin.service.js";
import { sessionCookieName } from "./auth.constants.js";
import { AuthIdentityService } from "./auth-identity.service.js";
import type { AuthenticatedRequest } from "./auth.types.js";

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly firebase: FirebaseAdminService,
    private readonly identities: AuthIdentityService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const sessionCookie = parseCookieHeader(request.headers.cookie).get(sessionCookieName);
    if (!sessionCookie) {
      throw new UnauthorizedException({
        code: "SESSION_REQUIRED",
        messageZh: "请先登录后再继续",
      });
    }

    const decoded = await this.firebase.verifySession(sessionCookie);
    request.currentUser = await this.identities.findActiveByFirebaseUid(decoded.uid);
    return true;
  }
}
