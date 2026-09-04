import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { StoresModule } from "../stores/stores.module.js";
import { BoardsController } from "./boards.controller.js";
import { BoardsService } from "./boards.service.js";
import { DispatchService } from "./dispatch.service.js";

@Module({
  imports: [AuthModule, StoresModule],
  controllers: [BoardsController],
  providers: [BoardsService, DispatchService, IdempotencyService],
  exports: [DispatchService],
})
export class BoardsModule {}
