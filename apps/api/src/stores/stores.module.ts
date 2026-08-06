import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { StoresController } from "./stores.controller.js";
import { StoresService } from "./stores.service.js";
import { MembershipsController } from "./memberships.controller.js";
import { MembershipsService } from "./memberships.service.js";
import { StoreAccessService } from "./store-access.service.js";
import { StoreManagementService } from "./store-management.service.js";
import { CatalogController } from "./catalog.controller.js";
import { CatalogService } from "./catalog.service.js";
import { IdempotencyService } from "../common/idempotency.service.js";
import { CommissionsController } from "./commissions.controller.js";
import { CommissionsService } from "./commissions.service.js";

@Module({
  imports: [AuthModule],
  controllers: [
    StoresController,
    MembershipsController,
    CatalogController,
    CommissionsController,
  ],
  providers: [
    StoresService,
    MembershipsService,
    StoreAccessService,
    StoreManagementService,
    CatalogService,
    IdempotencyService,
    CommissionsService,
  ],
  exports: [StoreAccessService],
})
export class StoresModule {}
