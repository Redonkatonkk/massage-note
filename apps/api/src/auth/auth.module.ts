import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { AuthIdentityService } from "./auth-identity.service.js";
import { FirebaseAdminService } from "./firebase-admin.service.js";
import { SessionAuthGuard } from "./session-auth.guard.js";
import { PasswordService } from "./password.service.js";

@Module({
  controllers: [AuthController],
  providers: [AuthIdentityService, FirebaseAdminService, PasswordService, SessionAuthGuard],
  exports: [AuthIdentityService, FirebaseAdminService, PasswordService, SessionAuthGuard],
})
export class AuthModule {}
