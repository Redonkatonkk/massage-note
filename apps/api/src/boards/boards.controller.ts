import {
  Body,
  Controller,
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
  addBoardRowSchema,
  boardDateSchema,
  calendarDateRangeQuerySchema,
  clockInSchema,
  clockOutSchema,
  idempotencyKeySchema,
  reorderBoardSchema,
  updateBoardRowSchema,
  rankBoardSchema,
  createDispatchIntentSchema,
  skipDispatchTurnSchema,
  cancelDispatchIntentSchema,
  removeBoardRowSchema,
  uuidSchema,
} from "@massage-note/contracts";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { parseRequest } from "../common/zod-request.js";
import { BoardsService } from "./boards.service.js";
import { DispatchService } from "./dispatch.service.js";

@Controller("stores/:storeId")
@UseGuards(SessionAuthGuard)
export class BoardsController {
  constructor(private readonly boards: BoardsService, private readonly dispatch: DispatchService) {}

  @Get("business-days/current")
  currentBusinessDay(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
  ) {
    return this.boards.currentBusinessDay(user, parseRequest(uuidSchema, storeId));
  }

  @Get("business-days/open-work-dates")
  openWorkDates(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Query() query: unknown,
  ) {
    return this.boards.openWorkDates(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(calendarDateRangeQuerySchema, query),
    );
  }

  @Get("boards/:businessDate")
  getBoard(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("businessDate") businessDate: string,
  ) {
    return this.boards.getBoard(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(boardDateSchema, businessDate),
    );
  }

  @Post("shifts/clock-in")
  clockIn(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    parseRequest(clockInSchema, body);
    return this.boards.clockIn(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Post("shifts/:shiftId/clock-out")
  clockOut(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("shiftId") shiftId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.boards.clockOut(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, shiftId),
      parseRequest(clockOutSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Post("boards/:businessDate/rows")
  addRow(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("businessDate") businessDate: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.boards.addRow(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(boardDateSchema, businessDate),
      parseRequest(addBoardRowSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Patch("boards/:businessDate/rows/:rowId")
  updateRow(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("businessDate") businessDate: string,
    @Param("rowId") rowId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.boards.updateRow(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(boardDateSchema, businessDate),
      parseRequest(uuidSchema, rowId),
      parseRequest(updateBoardRowSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Post("boards/:businessDate/reorder")
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("businessDate") businessDate: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.boards.reorder(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(boardDateSchema, businessDate),
      parseRequest(reorderBoardSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Post("boards/:businessDate/rank")
  rank(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("businessDate") businessDate: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.dispatch.rank(user, parseRequest(uuidSchema, storeId), parseRequest(boardDateSchema, businessDate), parseRequest(rankBoardSchema, body), parseRequest(idempotencyKeySchema, key), response.locals.requestId as string);
  }

  @Post("boards/:businessDate/dispatch-intents")
  createDispatchIntent(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("businessDate") businessDate: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.dispatch.createIntent(user, parseRequest(uuidSchema, storeId), parseRequest(boardDateSchema, businessDate), parseRequest(createDispatchIntentSchema, body), parseRequest(idempotencyKeySchema, key), response.locals.requestId as string);
  }

  @Post("boards/:businessDate/dispatch-skip")
  skipDispatchTurn(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("businessDate") businessDate: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.dispatch.skip(user, parseRequest(uuidSchema, storeId), parseRequest(boardDateSchema, businessDate), parseRequest(skipDispatchTurnSchema, body), parseRequest(idempotencyKeySchema, key), response.locals.requestId as string);
  }

  @Post("boards/:businessDate/dispatch-intents/:intentId/cancel")
  cancelDispatchIntent(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("businessDate") businessDate: string,
    @Param("intentId") intentId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.dispatch.cancelIntent(user, parseRequest(uuidSchema, storeId), parseRequest(boardDateSchema, businessDate), parseRequest(uuidSchema, intentId), parseRequest(cancelDispatchIntentSchema, body), parseRequest(idempotencyKeySchema, key), response.locals.requestId as string);
  }

  @Post("boards/:businessDate/rows/:rowId/remove")
  removeRow(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("businessDate") businessDate: string,
    @Param("rowId") rowId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.dispatch.removeRow(user, parseRequest(uuidSchema, storeId), parseRequest(boardDateSchema, businessDate), parseRequest(uuidSchema, rowId), parseRequest(removeBoardRowSchema, body), parseRequest(idempotencyKeySchema, key), response.locals.requestId as string);
  }
}
