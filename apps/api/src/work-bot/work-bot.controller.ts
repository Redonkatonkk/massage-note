import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  updateWorkBotInstructionsSchema,
  createWorkBotAliasSchema,
  deleteWorkBotBindingSchema,
  idempotencyKeySchema,
  updateWorkBotAliasSchema,
  uuidSchema,
  workBotContextRequestSchema,
  workBotEventSchema,
} from "@massage-note/contracts";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { parseRequest } from "../common/zod-request.js";
import { WorkBotService } from "./work-bot.service.js";

@Controller("integrations/langbot")
export class WorkBotIntegrationController {
  constructor(private readonly workBot: WorkBotService) {}

  @Post("work-context")
  context(
    @Headers("authorization") authorization: string | undefined,
    @Body() body: unknown,
  ) {
    return this.workBot.getIntegrationContext(
      authorization,
      parseRequest(workBotContextRequestSchema, body),
    );
  }

  @Post("work-events")
  handle(
    @Headers("authorization") authorization: string | undefined,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.workBot.handleEvent(
      authorization,
      parseRequest(idempotencyKeySchema, idempotencyKey),
      parseRequest(workBotEventSchema, body),
      response.locals.requestId as string,
    );
  }
}
@Controller("stores/:storeId/work-bot")
@UseGuards(SessionAuthGuard)
export class WorkBotAdminController {
  constructor(private readonly workBot: WorkBotService) {}

  @Get()
  getSettings(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string) {
    return this.workBot.getSettings(user, parseRequest(uuidSchema, storeId));
  }

  @Patch("instructions")
  updateInstructions(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    return this.workBot.updateInstructions(user, parseRequest(uuidSchema, storeId), parseRequest(updateWorkBotInstructionsSchema, body), response.locals.requestId as string);
  }

  @Post("aliases")
  createAlias(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.workBot.createAlias(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(createWorkBotAliasSchema, body),
      response.locals.requestId as string,
    );
  }

  @Patch("aliases/:aliasId")
  updateAlias(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("aliasId") aliasId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.workBot.updateAlias(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, aliasId),
      parseRequest(updateWorkBotAliasSchema, body),
      response.locals.requestId as string,
    );
  }

  @Delete("aliases/:aliasId")
  removeAlias(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("aliasId") aliasId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.workBot.removeAlias(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, aliasId),
      parseRequest(deleteWorkBotBindingSchema, body).version,
      response.locals.requestId as string,
    );
  }

  @Delete("groups/:bindingId")
  removeGroup(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("bindingId") bindingId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.workBot.removeGroupBinding(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, bindingId),
      parseRequest(deleteWorkBotBindingSchema, body).version,
      response.locals.requestId as string,
    );
  }

  @Delete("members/:bindingId")
  removeMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("bindingId") bindingId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.workBot.removeMemberBinding(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, bindingId),
      parseRequest(deleteWorkBotBindingSchema, body).version,
      response.locals.requestId as string,
    );
  }
}
