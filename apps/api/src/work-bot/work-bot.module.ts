import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { StoresModule } from "../stores/stores.module.js";
import { WorkBotAdminController, WorkBotIntegrationController } from "./work-bot.controller.js";
import { WorkBotService } from "./work-bot.service.js";

@Module({
  imports: [AuthModule, StoresModule],
  controllers: [WorkBotIntegrationController, WorkBotAdminController],
  providers: [WorkBotService],
})
export class WorkBotModule {}
