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
  createGiftCardSaleSchema,
  deleteGiftCardSaleSchema,
  idempotencyKeySchema,
  restoreGiftCardSaleSchema,
  updateGiftCardSaleSchema,
  uuidSchema,
} from "@massage-note/contracts";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { parseRequest } from "../common/zod-request.js";
import { GiftCardsService } from "./gift-cards.service.js";

@Controller("stores/:storeId/gift-card-sales")
@UseGuards(SessionAuthGuard)
export class GiftCardsController {
  constructor(private readonly giftCards: GiftCardsService) {}

  @Get("deleted")
  listDeleted(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
  ) {
    return this.giftCards.listDeleted(user, parseRequest(uuidSchema, storeId));
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.giftCards.create(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(createGiftCardSaleSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Patch(":saleId")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("saleId") saleId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.giftCards.update(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, saleId),
      parseRequest(updateGiftCardSaleSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Delete(":saleId")
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("saleId") saleId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.giftCards.remove(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, saleId),
      parseRequest(deleteGiftCardSaleSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }

  @Post(":saleId/restore")
  restore(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Param("saleId") saleId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.giftCards.restore(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(uuidSchema, saleId),
      parseRequest(restoreGiftCardSaleSchema, body),
      parseRequest(idempotencyKeySchema, idempotencyKey),
      response.locals.requestId as string,
    );
  }
}
