import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { StoresModule } from "../stores/stores.module.js";
import { BoardsController } from "./boards.controller.js";
import { BoardsService } from "./boards.service.js";
import { DispatchSmsAgentController, DispatchSmsStatusController } from "./dispatch-sms-deliveries.controller.js";
import { DispatchSmsDeliveriesService } from "./dispatch-sms-deliveries.service.js";
import { DispatchSmsScheduler } from "./dispatch-sms-scheduler.service.js";
import { DailyRankingService } from "./daily-ranking.service.js";

@Module({
  imports: [AuthModule, StoresModule],
  controllers: [BoardsController, DispatchSmsStatusController, DispatchSmsAgentController],
  providers: [BoardsService, DailyRankingService, DispatchSmsScheduler, DispatchSmsDeliveriesService, IdempotencyService],
})
export class BoardsModule {}
