import { Body, Controller, Get, Headers, Param, Post, Query, Res, UseGuards } from "@nestjs/common";
import { idempotencyKeySchema, storeBackupModeSchema, storeImportConfirmSchema, storeImportPreviewSchema, uuidSchema } from "@massage-note/contracts";
import type { Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { parseRequest } from "../common/zod-request.js";
import { StoreDataService } from "./store-data.service.js";

@Controller("stores/:storeId/data")
@UseGuards(SessionAuthGuard)
export class StoreDataController {
  constructor(private readonly data: StoreDataService) {}

  @Get("export")
  async export(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Query("mode") mode: unknown, @Query("previewId") previewId: unknown, @Res() response: Response) {
    const backup = await this.data.export(user, parseRequest(uuidSchema, storeId), parseRequest(storeBackupModeSchema, mode), previewId === undefined ? undefined : parseRequest(uuidSchema, previewId));
    const code = backup.mode === "anonymized" ? "demo" : backup.source.storeCode;
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="massage-note-${code}-${backup.mode}-${backup.exportedAt.replace(/[:.]/g, "-")}.json"`);
    response.send(JSON.stringify(backup));
  }

  @Post("import/preview")
  preview(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Body() body: unknown) {
    return this.data.preview(user, parseRequest(uuidSchema, storeId), parseRequest(storeImportPreviewSchema, body).backup);
  }

  @Post("import/confirm")
  confirm(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Body() body: unknown, @Headers("idempotency-key") key: unknown, @Res({ passthrough: true }) response: Response) {
    return this.data.confirm(user, parseRequest(uuidSchema, storeId), parseRequest(storeImportConfirmSchema, body), parseRequest(idempotencyKeySchema, key), response.locals.requestId as string);
  }
}
