import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  createPayrollSettlementSchema,
  deletePayrollSettlementSchema,
  idempotencyKeySchema,
  payrollListQuerySchema,
  restorePayrollSettlementSchema,
  updatePayrollSettlementSchema,
  uuidSchema,
} from "@massage-note/contracts";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { parseRequest } from "../common/zod-request.js";
import { PayrollSettlementsService } from "./payroll-settlements.service.js";

@Controller("stores/:storeId/payroll-settlements")
@UseGuards(SessionAuthGuard)
export class PayrollSettlementsController {
  constructor(private readonly payroll: PayrollSettlementsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Query() query: unknown,
  ) {
    return this.payroll.list(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(payrollListQuerySchema, query),
    );
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.payroll.create(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(createPayrollSettlementSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Get(":settlementId")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("settlementId") settlementId: string,
  ) {
    return this.payroll.get(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, settlementId),
    );
  }

  @Patch(":settlementId")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("settlementId") settlementId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.payroll.update(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, settlementId),
      parseRequest(updatePayrollSettlementSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Delete(":settlementId")
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("settlementId") settlementId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.payroll.remove(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, settlementId),
      parseRequest(deletePayrollSettlementSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Post(":settlementId/restore")
  restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("settlementId") settlementId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.payroll.restore(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, settlementId),
      parseRequest(restorePayrollSettlementSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }
}
