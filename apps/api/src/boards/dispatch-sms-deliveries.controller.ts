import { Body, Controller, Get, Headers, Param, Post, UseGuards } from "@nestjs/common";
import { closingDeliveryCompleteSchema, closingDeliveryFailureSchema, closingDeliveryReceiptSchema, prepareClosingTextSchema, uuidSchema } from "@massage-note/contracts";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import { parseRequest } from "../common/zod-request.js";
import { DispatchSmsDeliveriesService } from "./dispatch-sms-deliveries.service.js";

@Controller("stores/:storeId/dispatch-sms")
@UseGuards(SessionAuthGuard)
export class DispatchSmsStatusController {
  constructor(private readonly deliveries: DispatchSmsDeliveriesService) {}

  @Get("status")
  status(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string) {
    return this.deliveries.status(user.id, parseRequest(uuidSchema, storeId));
  }
}

@Controller("dispatch-sms-agent/jobs")
export class DispatchSmsAgentController {
  constructor(private readonly deliveries: DispatchSmsDeliveriesService) {}

  @Post("claim")
  claim(@Headers("authorization") auth: string | undefined) {
    return this.deliveries.claim(auth);
  }

  @Post(":id/prepare-text")
  prepare(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    return this.deliveries.prepare(auth, parseRequest(uuidSchema, id), parseRequest(prepareClosingTextSchema, body).leaseToken);
  }

  @Post(":id/authorize")
  authorize(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    return this.deliveries.authorize(auth, parseRequest(uuidSchema, id), parseRequest(prepareClosingTextSchema, body).leaseToken);
  }

  @Post(":id/complete")
  complete(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    const { leaseToken, receipt } = parseRequest(closingDeliveryCompleteSchema, body);
    return this.deliveries.complete(auth, parseRequest(uuidSchema, id), leaseToken, receipt);
  }

  @Post(":id/fail")
  fail(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    return this.deliveries.fail(auth, parseRequest(uuidSchema, id), parseRequest(closingDeliveryFailureSchema, body));
  }

  @Get("receipts")
  receipts(@Headers("authorization") auth: string | undefined) {
    return this.deliveries.receiptCandidates(auth);
  }

  @Post(":id/receipt")
  receipt(@Headers("authorization") auth: string | undefined, @Param("id") id: string, @Body() body: unknown) {
    return this.deliveries.receipt(auth, parseRequest(uuidSchema, id), parseRequest(closingDeliveryReceiptSchema, body));
  }
}
