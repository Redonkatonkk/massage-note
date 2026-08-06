import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  businessDateSchema,
  cancelBusinessDayClosingSchema,
  closeBusinessDaySchema,
  idempotencyKeySchema,
  uuidSchema,
} from "@massage-note/contracts";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { parseRequest } from "../common/zod-request.js";
import { ClosingsService } from "./closings.service.js";

@Controller("stores/:storeId/closings")
@UseGuards(SessionAuthGuard)
export class ClosingsController {
  constructor(private readonly closings: ClosingsService) {}

  @Get(":businessDate/preview")
  preview(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("businessDate") businessDate: string,
  ) {
    return this.closings.preview(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(businessDateSchema, businessDate),
    );
  }

  @Post(":businessDate")
  close(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("businessDate") businessDate: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.closings.close(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(businessDateSchema, businessDate),
      parseRequest(closeBusinessDaySchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Post(":businessDate/cancel")
  cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("businessDate") businessDate: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.closings.cancel(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(businessDateSchema, businessDate),
      parseRequest(cancelBusinessDayClosingSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }
}
