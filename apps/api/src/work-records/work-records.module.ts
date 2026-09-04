import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { StoresModule } from "../stores/stores.module.js";
import { WorkRecordsController } from "./work-records.controller.js";
import { WorkRecordsService } from "./work-records.service.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { BoardsModule } from "../boards/boards.module.js";

@Module({
  imports: [AuthModule, StoresModule, BoardsModule],
  controllers: [WorkRecordsController],
  providers: [WorkRecordsService, IdempotencyService],
  exports: [WorkRecordsService],
})
export class WorkRecordsModule {}
