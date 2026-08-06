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
  confirmPaymentSchema,
  createWorkRecordSchema,
  deleteWorkRecordSchema,
  idempotencyKeySchema,
  restoreWorkRecordSchema,
  updateWorkRecordSchema,
  uuidSchema,
} from "@massage-note/contracts";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { parseRequest } from "../common/zod-request.js";
import { WorkRecordsService } from "./work-records.service.js";

@Controller("stores/:storeId/work-records")
@UseGuards(SessionAuthGuard)
export class WorkRecordsController {
  constructor(private readonly workRecords: WorkRecordsService) {}

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.workRecords.create(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(createWorkRecordSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Get("deleted")
  listDeleted(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
  ) {
    return this.workRecords.listDeleted(
      user,
      parseRequest(uuidSchema, storeId),
    );
  }

  @Get(":recordId")
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("recordId") recordId: string,
  ) {
    return this.workRecords.get(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, recordId),
    );
  }

  @Patch(":recordId")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("recordId") recordId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.workRecords.update(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, recordId),
      parseRequest(updateWorkRecordSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Post(":recordId/confirm-payment")
  confirmPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("recordId") recordId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.workRecords.confirmPayment(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, recordId),
      parseRequest(confirmPaymentSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Delete(":recordId")
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("recordId") recordId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.workRecords.remove(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, recordId),
      parseRequest(deleteWorkRecordSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Post(":recordId/restore")
  restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("recordId") recordId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.workRecords.restore(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, recordId),
      parseRequest(restoreWorkRecordSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }
}
