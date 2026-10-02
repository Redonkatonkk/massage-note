import { Body, Controller, Delete, Get, Headers, HttpCode, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { clearExpensePeriodSchema, createExpenseSchema, expensePeriodSchema, expenseQuerySchema, expenseVersionSchema, idempotencyKeySchema, reviseExpenseSchema, stopExpenseSchema, updateExpenseSchema, uuidSchema } from "@massage-note/contracts";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { parseRequest } from "../common/zod-request.js";
import { ExpensesService } from "./expenses.service.js";

@Controller("stores/:storeId/expenses")
@UseGuards(SessionAuthGuard)
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}
  @Get()
  month(@CurrentUser() actor: AuthenticatedUser, @Param("storeId") storeId: string, @Query() query: unknown) {
    return this.expenses.month(actor, parseRequest(uuidSchema, storeId), parseRequest(expenseQuerySchema, query).month);
  }
  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Param("storeId") storeId: string, @Body() body: unknown, @Headers("idempotency-key") key: string | undefined, @Res({ passthrough: true }) res: Response) {
    return this.expenses.create(actor, parseRequest(uuidSchema, storeId), parseRequest(createExpenseSchema, body), parseRequest(idempotencyKeySchema, key), res.locals.requestId as string);
  }
  @Patch(":id")
  update(@CurrentUser() actor: AuthenticatedUser, @Param("storeId") storeId: string, @Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key: string | undefined, @Res({ passthrough: true }) res: Response) {
    return this.expenses.update(actor, parseRequest(uuidSchema, storeId), parseRequest(uuidSchema, id), parseRequest(updateExpenseSchema, body), parseRequest(idempotencyKeySchema, key), res.locals.requestId as string);
  }
  @Post(":id/rules")
  @HttpCode(200)
  revise(@CurrentUser() actor: AuthenticatedUser, @Param("storeId") storeId: string, @Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key: string | undefined, @Res({ passthrough: true }) res: Response) {
    return this.expenses.revise(actor, parseRequest(uuidSchema, storeId), parseRequest(uuidSchema, id), parseRequest(reviseExpenseSchema, body), parseRequest(idempotencyKeySchema, key), res.locals.requestId as string);
  }
  @Post(":id/stop")
  @HttpCode(200)
  stop(@CurrentUser() actor: AuthenticatedUser, @Param("storeId") storeId: string, @Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key: string | undefined, @Res({ passthrough: true }) res: Response) {
    return this.expenses.stop(actor, parseRequest(uuidSchema, storeId), parseRequest(uuidSchema, id), parseRequest(stopExpenseSchema, body), parseRequest(idempotencyKeySchema, key), res.locals.requestId as string);
  }
  @Post(":id/periods")
  @HttpCode(200)
  period(@CurrentUser() actor: AuthenticatedUser, @Param("storeId") storeId: string, @Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key: string | undefined, @Res({ passthrough: true }) res: Response) {
    return this.expenses.period(actor, parseRequest(uuidSchema, storeId), parseRequest(uuidSchema, id), parseRequest(expensePeriodSchema, body), parseRequest(idempotencyKeySchema, key), res.locals.requestId as string);
  }
  @Delete(":id/periods")
  clearPeriod(@CurrentUser() actor: AuthenticatedUser, @Param("storeId") storeId: string, @Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key: string | undefined, @Res({ passthrough: true }) res: Response) {
    return this.expenses.period(actor, parseRequest(uuidSchema, storeId), parseRequest(uuidSchema, id), parseRequest(clearExpensePeriodSchema, body), parseRequest(idempotencyKeySchema, key), res.locals.requestId as string);
  }
  @Delete(":id")
  remove(@CurrentUser() actor: AuthenticatedUser, @Param("storeId") storeId: string, @Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key: string | undefined, @Res({ passthrough: true }) res: Response) {
    return this.expenses.remove(actor, parseRequest(uuidSchema, storeId), parseRequest(uuidSchema, id), parseRequest(expenseVersionSchema, body), parseRequest(idempotencyKeySchema, key), res.locals.requestId as string);
  }
  @Post(":id/restore")
  @HttpCode(200)
  restore(@CurrentUser() actor: AuthenticatedUser, @Param("storeId") storeId: string, @Param("id") id: string, @Body() body: unknown, @Headers("idempotency-key") key: string | undefined, @Res({ passthrough: true }) res: Response) {
    return this.expenses.restore(actor, parseRequest(uuidSchema, storeId), parseRequest(uuidSchema, id), parseRequest(expenseVersionSchema, body), parseRequest(idempotencyKeySchema, key), res.locals.requestId as string);
  }
}
