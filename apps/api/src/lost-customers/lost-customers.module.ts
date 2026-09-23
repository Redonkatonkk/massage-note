import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { StoresModule } from "../stores/stores.module.js";
import { LostCustomersController } from "./lost-customers.controller.js";
import { LostCustomersService } from "./lost-customers.service.js";

@Module({ imports: [AuthModule, StoresModule], controllers: [LostCustomersController], providers: [LostCustomersService, IdempotencyService] })
export class LostCustomersModule {}
