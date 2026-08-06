import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { auditLogQuerySchema, uuidSchema } from "@massage-note/contracts";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { parseRequest } from "../common/zod-request.js";
import { AuditService } from "./audit.service.js";

@Controller("stores/:storeId/audit-logs")
@UseGuards(SessionAuthGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

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
