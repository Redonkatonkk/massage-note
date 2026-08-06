import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  idempotencyKeySchema,
  catalogListQuerySchema,
  createCatalogItemSchema,
  deleteCatalogItemSchema,
  initializeCatalogSchema,
  restoreCatalogItemSchema,
  updateCatalogItemSchema,
  uuidSchema,
} from "@massage-note/contracts";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { parseRequest } from "../common/zod-request.js";
import { CatalogService } from "./catalog.service.js";

@Controller("stores/:storeId/catalog")
@UseGuards(SessionAuthGuard)
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Query() query: unknown,
  ) {
    return this.catalog.list(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(catalogListQuerySchema, query),
    );
  }

  @Post("setup")
  initialize(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.catalog.initialize(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(initializeCatalogSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Post("items")
  createItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.catalog.createItem(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(createCatalogItemSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Patch("items/:itemId")
  updateItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("itemId") itemId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.catalog.updateItem(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, itemId),
      parseRequest(updateCatalogItemSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Delete("items/:itemId")
  deleteItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("itemId") itemId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.catalog.deleteItem(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, itemId),
      parseRequest(deleteCatalogItemSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Post("items/:itemId/restore")
  restoreItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("itemId") itemId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.catalog.restoreItem(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, itemId),
      parseRequest(restoreCatalogItemSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }
}
