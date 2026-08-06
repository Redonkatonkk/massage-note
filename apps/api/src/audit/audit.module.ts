import { Module } from "@nestjs/common";
import { StoresModule } from "../stores/stores.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { AuditController } from "./audit.controller.js";
import { AuditService } from "./audit.service.js";

@Module({
  imports: [AuthModule, StoresModule],
  controllers: [AuditController],
  providers: [AuditService],
  exports: [AuditService],
})
export class AuditModule {}
