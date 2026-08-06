import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { updatePasswordSchema, updateProfileSchema } from "@massage-note/contracts";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { parseRequest } from "../common/zod-request.js";
import { UsersService } from "./users.service.js";

@Controller("me")
@UseGuards(SessionAuthGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  async me(@CurrentUser() user: AuthenticatedUser) {
    const result = await this.users.me(user.id);
    return {
      ...result,
      needsProfile: !result.firstName || !result.lastName,
    };
  }

  @Patch("profile")
  updateProfile(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    return this.users.updateProfile(user, parseRequest(updateProfileSchema, body));
  }

  @Patch("password")
  updatePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
  ) {
    return this.users.updatePassword(user, parseRequest(updatePasswordSchema, body));
  }
}
