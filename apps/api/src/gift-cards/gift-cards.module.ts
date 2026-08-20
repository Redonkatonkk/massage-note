import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { StoresModule } from "../stores/stores.module.js";
import { GiftCardsController } from "./gift-cards.controller.js";
import { GiftCardsService } from "./gift-cards.service.js";

@Module({
  imports: [AuthModule, StoresModule],
  controllers: [GiftCardsController],
  providers: [GiftCardsService, IdempotencyService],
})
export class GiftCardsModule {}
