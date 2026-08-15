import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  approveJoinRequestSchema,
  createEmployeeSchema,
  deactivateMembershipSchema,
  rejectJoinRequestSchema,
  restoreMembershipSchema,
  updateMembershipSchema,
  uuidSchema,
} from "@massage-note/contracts";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { parseRequest } from "../common/zod-request.js";
import { MembershipsService } from "./memberships.service.js";

@Controller("stores/:storeId")
@UseGuards(SessionAuthGuard)
export class MembershipsController {
  constructor(private readonly memberships: MembershipsService) {}

  @Get("join-requests")
  listJoinRequests(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
  ) {
    return this.memberships.listJoinRequests(
      user,
      parseRequest(uuidSchema, storeId),
    );
  }

  @Post("join-requests/:joinRequestId/approve")
  approveJoinRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("joinRequestId") joinRequestId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.memberships.approveJoinRequest(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, joinRequestId),
      parseRequest(approveJoinRequestSchema, body),
      response.locals.requestId as string,
    );
  }

  @Post("join-requests/:joinRequestId/reject")
  rejectJoinRequest(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("joinRequestId") joinRequestId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.memberships.rejectJoinRequest(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, joinRequestId),
      parseRequest(rejectJoinRequestSchema, body),
      response.locals.requestId as string,
    );
  }

  @Get("members")
  listMembers(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
  ) {
    return this.memberships.listMembers(user, parseRequest(uuidSchema, storeId));
  }

  @Post("members")
  createEmployee(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.memberships.createEmployee(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(createEmployeeSchema, body),
      response.locals.requestId as string,
    );
  }

  @Patch("members/:membershipId")
  updateMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("membershipId") membershipId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.memberships.updateMember(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, membershipId),
      parseRequest(updateMembershipSchema, body),
      response.locals.requestId as string,
    );
  }

  @Delete("members/:membershipId")
  deactivateMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("membershipId") membershipId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.memberships.deactivateMember(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, membershipId),
      parseRequest(deactivateMembershipSchema, body),
      response.locals.requestId as string,
    );
  }

  @Post("members/:membershipId/restore")
  restoreMember(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("membershipId") membershipId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.memberships.restoreMember(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, membershipId),
      parseRequest(restoreMembershipSchema, body),
      response.locals.requestId as string,
    );
  }
}
