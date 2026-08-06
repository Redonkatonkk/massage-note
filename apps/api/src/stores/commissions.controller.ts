import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Put,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  idempotencyKeySchema,
  setEmployeeDefaultCommissionSchema,
  setEmployeeItemCommissionSchema,
  uuidSchema,
} from "@massage-note/contracts";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { parseRequest } from "../common/zod-request.js";
import { CommissionsService } from "./commissions.service.js";

@Controller("stores/:storeId/members/:membershipId/commissions")
@UseGuards(SessionAuthGuard)
export class CommissionsController {
  constructor(private readonly commissions: CommissionsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("membershipId") membershipId: string,
  ) {
    return this.commissions.list(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, membershipId),
    );
  }

  @Put("default")
  setDefault(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("membershipId") membershipId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.commissions.setDefault(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, membershipId),
      parseRequest(setEmployeeDefaultCommissionSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Put("item")
  setItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("membershipId") membershipId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.commissions.setItem(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, membershipId),
      parseRequest(setEmployeeItemCommissionSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }
}
