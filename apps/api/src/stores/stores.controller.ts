import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  createJoinRequestSchema,
  createStoreSchema,
  deleteStoreSchema,
  idempotencyKeySchema,
  storeCodeSchema,
  transferOwnerSchema,
  updateStoreSchema,
  uuidSchema,
} from "@massage-note/contracts";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { parseRequest } from "../common/zod-request.js";
import { StoresService } from "./stores.service.js";
import { StoreManagementService } from "./store-management.service.js";

@Controller("stores")
export class StoresController {
  constructor(
    private readonly stores: StoresService,
    private readonly management: StoreManagementService,
  ) {}

  @Get("resolve-code/:code")
  resolveCode(@Param("code") code: string) {
    return this.stores.resolveCode(parseRequest(storeCodeSchema, code));
  }

  @Get()
  @UseGuards(SessionAuthGuard)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.stores.listForUser(user.id);
  }

  @Get(":storeId")
  @UseGuards(SessionAuthGuard)
  get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
  ) {
    return this.management.get(user, parseRequest(uuidSchema, storeId));
  }

  @Patch(":storeId")
  @UseGuards(SessionAuthGuard)
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.management.update(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(updateStoreSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Post(":storeId/owner-transfer")
  @UseGuards(SessionAuthGuard)
  transferOwner(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.management.transferOwner(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(transferOwnerSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Delete(":storeId")
  @UseGuards(SessionAuthGuard)
  delete(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.management.delete(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(deleteStoreSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Post()
  @UseGuards(SessionAuthGuard)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.stores.create(
      user,
      parseRequest(createStoreSchema, body),
      response.locals.requestId as string,
    );
  }

  @Post(":storeId/join-requests")
  @UseGuards(SessionAuthGuard)
  requestToJoin(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.stores.requestToJoin(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(createJoinRequestSchema, body),
      response.locals.requestId as string,
    );
  }
}
