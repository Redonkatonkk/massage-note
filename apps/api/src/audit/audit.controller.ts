import { Controller, Get, Headers, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { auditLogQuerySchema, idempotencyKeySchema, uuidSchema } from "@massage-note/contracts";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { parseRequest } from "../common/zod-request.js";
import { AuditService } from "./audit.service.js";

@Controller("stores/:storeId/audit-logs")
@UseGuards(SessionAuthGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Post(":auditLogId/undo")
  undo(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("auditLogId") auditLogId: string,
    @Headers("idempotency-key") key: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.audit.undo(user, parseRequest(uuidSchema, storeId), parseRequest(uuidSchema, auditLogId), parseRequest(idempotencyKeySchema, key), response.locals.requestId as string);
  }

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Query() query: unknown,
  ) {
    return this.audit.list(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(auditLogQuerySchema, query),
    );
  }
}
