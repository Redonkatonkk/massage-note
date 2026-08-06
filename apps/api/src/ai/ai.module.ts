import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { FinanceModule } from "../finance/finance.module.js";
import { StoresModule } from "../stores/stores.module.js";
import { WorkRecordsModule } from "../work-records/work-records.module.js";
import { AiController } from "./ai.controller.js";
import { AiService } from "./ai.service.js";
import { MiniMaxLanguageModelProvider } from "./language-model.provider.js";
import { GoogleSpeechToTextProvider } from "./speech-to-text.provider.js";

@Module({
  imports: [AuthModule, StoresModule, FinanceModule, WorkRecordsModule],
  controllers: [AiController],
  providers: [AiService, MiniMaxLanguageModelProvider, GoogleSpeechToTextProvider],
})
export class AiModule {}
