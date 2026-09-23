import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Res, UseGuards } from "@nestjs/common";
import { createLostCustomerSchema, deleteLostCustomerSchema, idempotencyKeySchema, listLostCustomersQuerySchema, updateLostCustomerSchema, uuidSchema } from "@massage-note/contracts";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { parseRequest } from "../common/zod-request.js";
import { LostCustomersService } from "./lost-customers.service.js";

@Controller("stores/:storeId/lost-customers")
@UseGuards(SessionAuthGuard)
export class LostCustomersController {
  constructor(private readonly lostCustomers: LostCustomersService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Query() query: unknown) {
    return this.lostCustomers.list(user, parseRequest(uuidSchema, storeId), parseRequest(listLostCustomersQuerySchema, query));
  }

  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    return this.lostCustomers.create(user, parseRequest(uuidSchema, storeId), parseRequest(createLostCustomerSchema, body), parseRequest(idempotencyKeySchema, key), response.locals.requestId as string);
  }

  @Patch(":id")
  update(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    return this.lostCustomers.update(user, parseRequest(uuidSchema, storeId), parseRequest(uuidSchema, id), parseRequest(updateLostCustomerSchema, body), parseRequest(idempotencyKeySchema, key), response.locals.requestId as string);
  }

  @Delete(":id")
  remove(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Param("id") id: string, @Headers("idempotency-key") key: string | undefined, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    return this.lostCustomers.remove(user, parseRequest(uuidSchema, storeId), parseRequest(uuidSchema, id), parseRequest(deleteLostCustomerSchema, body), parseRequest(idempotencyKeySchema, key), response.locals.requestId as string);
  }
}
