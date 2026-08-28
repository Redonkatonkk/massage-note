import { Body, Controller, Delete, Get, Headers, Param, Post, Res, UseGuards } from "@nestjs/common";
import {
  businessDateSchema,
  closingAgentHeartbeatSchema,
  closingDeliveryAuthorizeSchema,
  closingDeliveryCompleteSchema,
  closingDeliveryFailureSchema,
  idempotencyKeySchema,
  uuidSchema,
} from "@massage-note/contracts";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { parseRequest } from "../common/zod-request.js";
import { ClosingDeliveriesService } from "./closing-deliveries.service.js";

@Controller("stores/:storeId/closings/:businessDate/deliveries")
@UseGuards(SessionAuthGuard)
export class ClosingDeliveriesController {
  constructor(private readonly deliveries: ClosingDeliveriesService) {}

  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Param("businessDate") businessDate: string) {
    return this.deliveries.list(user, parseRequest(uuidSchema, storeId), parseRequest(businessDateSchema, businessDate));
  }

  @Post("batch")
  batch(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Param("businessDate") businessDate: string, @Headers("idempotency-key") key: string | undefined, @Res({ passthrough: true }) response: Response) {
    return this.deliveries.queueBatch(user, parseRequest(uuidSchema, storeId), parseRequest(businessDateSchema, businessDate), parseRequest(idempotencyKeySchema, key), response.locals.requestId as string);
  }

  @Post("members/:membershipId")
  member(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Param("businessDate") businessDate: string, @Param("membershipId") membershipId: string, @Headers("idempotency-key") key: string | undefined, @Res({ passthrough: true }) response: Response) {
    return this.deliveries.queueMember(user, parseRequest(uuidSchema, storeId), parseRequest(businessDateSchema, businessDate), parseRequest(uuidSchema, membershipId), parseRequest(idempotencyKeySchema, key), response.locals.requestId as string);
  }

  @Delete(":deliveryId")
  cancel(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Param("businessDate") businessDate: string, @Param("deliveryId") deliveryId: string, @Res({ passthrough: true }) response: Response) {
    return this.deliveries.cancel(user, parseRequest(uuidSchema, storeId), parseRequest(businessDateSchema, businessDate), parseRequest(uuidSchema, deliveryId), response.locals.requestId as string);
  }
}

@Controller("stores/:storeId/closing-delivery-agent")
@UseGuards(SessionAuthGuard)
export class ClosingDeliveryAgentSettingsController {
  constructor(private readonly deliveries: ClosingDeliveriesService) {}

  @Get("status")
  status(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string) {
    return this.deliveries.agentStatus(user, parseRequest(uuidSchema, storeId));
  }

  @Post("credential")
  rotate(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Res({ passthrough: true }) response: Response) {
    return this.deliveries.rotateAgentCredential(user, parseRequest(uuidSchema, storeId), response.locals.requestId as string);
  }

  @Delete("credential")
  revoke(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Res({ passthrough: true }) response: Response) {
    return this.deliveries.revokeAgentCredential(user, parseRequest(uuidSchema, storeId), response.locals.requestId as string);
  }
}

@Controller("closing-delivery-agent")
export class ClosingDeliveryAgentController {
  constructor(private readonly deliveries: ClosingDeliveriesService) {}

  @Post("jobs/claim")
  claim(@Headers("authorization") authorization: string | undefined) {
    return this.deliveries.claim(authorization);
  }

  @Post("jobs/:deliveryId/authorize")
  authorize(@Headers("authorization") authorization: string | undefined, @Param("deliveryId") deliveryId: string, @Body() body: unknown) {
    const input = parseRequest(closingDeliveryAuthorizeSchema, body);
    return this.deliveries.authorize(authorization, parseRequest(uuidSchema, deliveryId), input.leaseToken);
  }

  @Post("jobs/:deliveryId/complete")
  complete(@Headers("authorization") authorization: string | undefined, @Param("deliveryId") deliveryId: string, @Body() body: unknown) {
    const input = parseRequest(closingDeliveryCompleteSchema, body);
    return this.deliveries.complete(authorization, parseRequest(uuidSchema, deliveryId), input.leaseToken);
  }

  @Post("jobs/:deliveryId/fail")
  fail(@Headers("authorization") authorization: string | undefined, @Param("deliveryId") deliveryId: string, @Body() body: unknown) {
    return this.deliveries.fail(authorization, parseRequest(uuidSchema, deliveryId), parseRequest(closingDeliveryFailureSchema, body));
  }

  @Post("heartbeat")
  heartbeat(@Headers("authorization") authorization: string | undefined, @Body() body: unknown) {
    return this.deliveries.heartbeat(authorization, parseRequest(closingAgentHeartbeatSchema, body));
  }
}
