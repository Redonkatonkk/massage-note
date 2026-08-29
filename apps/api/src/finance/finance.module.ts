import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { StoresModule } from "../stores/stores.module.js";
import { CashSettlementsController } from "./cash-settlements.controller.js";
import { CashSettlementsService } from "./cash-settlements.service.js";
import { ClosingsController } from "./closings.controller.js";
import { ClosingsService } from "./closings.service.js";
import { FinanceQueriesController } from "./finance-queries.controller.js";
import { FinanceQueriesService } from "./finance-queries.service.js";
import { PayrollSettlementsController } from "./payroll-settlements.controller.js";
import { PayrollSettlementsService } from "./payroll-settlements.service.js";
import { ClosingDeliveriesController, ClosingDeliveryAgentController, ClosingDeliveryAgentSettingsController } from "./closing-deliveries.controller.js";
import { ClosingDeliveriesService } from "./closing-deliveries.service.js";
import { EmployeeSettlementDeliveryAgentController, EmployeeSettlementsController } from "./employee-settlements.controller.js";
import { EmployeeSettlementsService } from "./employee-settlements.service.js";

@Module({
  imports: [AuthModule, StoresModule],
  controllers: [
    ClosingsController,
    CashSettlementsController,
    PayrollSettlementsController,
    FinanceQueriesController,
    ClosingDeliveriesController,
    ClosingDeliveryAgentSettingsController,
    ClosingDeliveryAgentController,
    EmployeeSettlementsController,
    EmployeeSettlementDeliveryAgentController,
  ],
  providers: [
    ClosingsService,
    CashSettlementsService,
    PayrollSettlementsService,
    FinanceQueriesService,
    IdempotencyService,
    ClosingDeliveriesService,
    EmployeeSettlementsService,
  ],
  exports: [FinanceQueriesService, CashSettlementsService],
})
export class FinanceModule {}
