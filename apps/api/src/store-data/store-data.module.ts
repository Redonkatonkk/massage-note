import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { StoresModule } from "../stores/stores.module.js";
import { StoreDataController } from "./store-data.controller.js";
import { StoreDataService } from "./store-data.service.js";

@Module({ imports: [AuthModule, StoresModule], controllers: [StoreDataController], providers: [StoreDataService] })
export class StoreDataModule {}
