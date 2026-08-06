import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { StoresModule } from "../stores/stores.module.js";
import { RealtimeController } from "./realtime.controller.js";
import { RealtimeService } from "./realtime.service.js";

@Module({
  imports: [AuthModule, StoresModule],
  controllers: [RealtimeController],
  providers: [RealtimeService],
})
export class RealtimeModule {}
