import { Body, Controller, Delete, Get, Headers, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import { closingDeliveryAuthorizeSchema, closingDeliveryCompleteSchema, closingDeliveryFailureSchema, createEmployeeSettlementDeliverySchema, employeeSettlementAttachmentSchema, employeeSettlementQuerySchema, idempotencyKeySchema, uuidSchema } from "@massage-note/contracts";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { parseRequest } from "../common/zod-request.js";
import { EmployeeSettlementsService } from "./employee-settlements.service.js";

@Controller("stores/:storeId/employee-settlements")
@UseGuards(SessionAuthGuard)
export class EmployeeSettlementsController {
  constructor(private readonly settlements: EmployeeSettlementsService) {}

  @Get("preview")
  preview(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Query() query: unknown) {
    return this.settlements.preview(user, parseRequest(uuidSchema, storeId), parseRequest(employeeSettlementQuerySchema, query));
  }

  @Get("deliveries")
  list(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string) {
    return this.settlements.listDeliveries(user, parseRequest(uuidSchema, storeId));
  }

  @Post("deliveries")
  queue(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Body() body: unknown, @Headers("idempotency-key") key: string | undefined, @Res({ passthrough: true }) response: Response) {
    return this.settlements.queue(user, parseRequest(uuidSchema, storeId), parseRequest(createEmployeeSettlementDeliverySchema, body), parseRequest(idempotencyKeySchema, key), response.locals.requestId as string);
  }

  @Delete("deliveries/:deliveryId")
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Param("deliveryId") deliveryId: string, @Res({ passthrough: true }) response: Response) {
    return this.settlements.cancel(user, parseRequest(uuidSchema, storeId), parseRequest(uuidSchema, deliveryId), response.locals.requestId as string);
  }

  @Post("deliveries/:deliveryId/retry")
  retry(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Param("deliveryId") deliveryId: string, @Res({ passthrough: true }) response: Response) {
    return this.settlements.retry(user, parseRequest(uuidSchema, storeId), parseRequest(uuidSchema, deliveryId), response.locals.requestId as string);
  }
}

@Controller("employee-settlement-delivery-agent")
export class EmployeeSettlementDeliveryAgentController {
  constructor(private readonly settlements: EmployeeSettlementsService) {}

  @Post("jobs/claim")
  claim(@Headers("authorization") authorization: string | undefined) { return this.settlements.claim(authorization); }

  @Post("jobs/:deliveryId/authorize")
  authorize(@Headers("authorization") authorization: string | undefined, @Param("deliveryId") deliveryId: string, @Body() body: unknown) {
    const input = parseRequest(closingDeliveryAuthorizeSchema, body);
    return this.settlements.authorize(authorization, parseRequest(uuidSchema, deliveryId), input.leaseToken);
  }

  @Post("jobs/:deliveryId/checkpoint")
  checkpoint(@Headers("authorization") authorization: string | undefined, @Param("deliveryId") deliveryId: string, @Body() body: unknown) {
    const input = parseRequest(employeeSettlementAttachmentSchema, body);
    return this.settlements.checkpoint(authorization, parseRequest(uuidSchema, deliveryId), input.leaseToken, input.attachment);
  }

  @Post("jobs/:deliveryId/complete")
  complete(@Headers("authorization") authorization: string | undefined, @Param("deliveryId") deliveryId: string, @Body() body: unknown) {
    const input = parseRequest(closingDeliveryCompleteSchema, body);
    return this.settlements.complete(authorization, parseRequest(uuidSchema, deliveryId), input.leaseToken);
  }

  @Post("jobs/:deliveryId/fail")
  fail(@Headers("authorization") authorization: string | undefined, @Param("deliveryId") deliveryId: string, @Body() body: unknown) {
    return this.settlements.fail(authorization, parseRequest(uuidSchema, deliveryId), parseRequest(closingDeliveryFailureSchema, body));
  }
}
