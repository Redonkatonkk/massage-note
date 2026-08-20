import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller.js";
import { FinanceCalculatorService } from "./finance/finance-calculator.service.js";
import { AuthModule } from "./auth/auth.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { StoresModule } from "./stores/stores.module.js";
import { UsersModule } from "./users/users.module.js";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { JsonSafeInterceptor } from "./common/json-safe.interceptor.js";
import { WorkRecordsModule } from "./work-records/work-records.module.js";
import { BoardsModule } from "./boards/boards.module.js";
import { FinanceModule } from "./finance/finance.module.js";
import { AuditModule } from "./audit/audit.module.js";
import { RealtimeModule } from "./realtime/realtime.module.js";
import { AiModule } from "./ai/ai.module.js";
import { RateLimitService } from "./common/rate-limit.service.js";
import { GiftCardsModule } from "./gift-cards/gift-cards.module.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    UsersModule,
    StoresModule,
    WorkRecordsModule,
    GiftCardsModule,
    BoardsModule,
    FinanceModule,
    AuditModule,
    RealtimeModule,
    AiModule,
  ],
  controllers: [HealthController],
  providers: [
    FinanceCalculatorService,
    RateLimitService,
    { provide: APP_INTERCEPTOR, useClass: JsonSafeInterceptor },
  ],
})
export class AppModule {}
