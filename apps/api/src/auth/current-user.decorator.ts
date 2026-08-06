import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { AuthenticatedRequest, AuthenticatedUser } from "./auth.types.js";

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.currentUser) {
      throw new Error("SessionAuthGuard 必须在 CurrentUser 之前执行");
    }
    return request.currentUser;
  },
);
