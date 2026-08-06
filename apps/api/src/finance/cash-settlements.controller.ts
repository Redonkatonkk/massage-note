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
  idempotencyKeySchema,
  reopenCashSchema,
  settleAllCashSchema,
  settleCashSchema,
  uuidSchema,
} from "@massage-note/contracts";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { parseRequest } from "../common/zod-request.js";
import { CashSettlementsService } from "./cash-settlements.service.js";

@Controller("stores/:storeId/cash-settlements")
@UseGuards(SessionAuthGuard)
export class CashSettlementsController {
  constructor(private readonly cash: CashSettlementsService) {}

  @Get(":businessDate")
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("businessDate") businessDate: string,
  ) {
    return this.cash.list(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(businessDateSchema, businessDate),
    );
  }

  @Post(":businessDate/settle-all")
  settleAll(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("businessDate") businessDate: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.cash.settleAll(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(businessDateSchema, businessDate),
      parseRequest(settleAllCashSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Post(":businessDate/:membershipId/settle")
  settle(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("businessDate") businessDate: string,
    @Param("membershipId") membershipId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.cash.settle(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(businessDateSchema, businessDate),
      parseRequest(uuidSchema, membershipId),
      parseRequest(settleCashSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Post(":businessDate/:membershipId/reopen")
  reopen(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("businessDate") businessDate: string,
    @Param("membershipId") membershipId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.cash.reopen(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(businessDateSchema, businessDate),
      parseRequest(uuidSchema, membershipId),
      parseRequest(reopenCashSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }
}
