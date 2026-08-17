import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Post, Req, Res, UseGuards } from "@nestjs/common";
import { aiMessageSchema, confirmAiPreviewSchema, uuidSchema } from "@massage-note/contracts";
import type { Request, Response } from "express";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { parseRequest } from "../common/zod-request.js";
import { AiService } from "./ai.service.js";

@Controller("stores/:storeId/ai")
@UseGuards(SessionAuthGuard)
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Post("work/messages")
  workMessage(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Body() body: unknown) {
    return this.ai.workMessage(user, parseRequest(uuidSchema, storeId), parseRequest(aiMessageSchema, body));
  }

  @Post("finance/messages")
  financeMessage(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Body() body: unknown) {
    return this.ai.financeMessage(user, parseRequest(uuidSchema, storeId), parseRequest(aiMessageSchema, body));
  }

  @Post("work/transcribe")
  async transcribe(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Headers("content-type") contentType: string | undefined, @Headers("accept-language") acceptLanguage: string | undefined, @Req() request: Request) {
    const mediaType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
    if (!mediaType || !["audio/mp4", "video/mp4", "audio/m4a", "audio/x-m4a"].includes(mediaType)) {
      throw new BadRequestException({ code: "AUDIO_TYPE_UNSUPPORTED", messageZh: "录音必须使用浏览器 MP4/AAC 格式" });
    }
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of request) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      size += buffer.length;
      if (size > 8 * 1024 * 1024) throw new BadRequestException({ code: "AUDIO_TOO_LARGE", messageZh: "录音不能超过 8 MB 或 60 秒" });
      chunks.push(buffer);
    }
    return this.ai.transcribe(
      user,
      parseRequest(uuidSchema, storeId),
      Buffer.concat(chunks),
      acceptLanguage?.toLowerCase().startsWith("en") ? "en-US" : "zh-CN",
    );
  }

  @Get("previews/:previewId")
  getPreview(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Param("previewId") previewId: string) {
    return this.ai.getPreview(user, parseRequest(uuidSchema, storeId), parseRequest(uuidSchema, previewId));
  }

  @Post("previews/:previewId/confirm")
  confirmPreview(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Param("previewId") previewId: string, @Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    parseRequest(confirmAiPreviewSchema, body);
    return this.ai.confirmPreview(user, parseRequest(uuidSchema, storeId), parseRequest(uuidSchema, previewId), response.locals.requestId as string);
  }

  @Delete("previews/:previewId")
  cancelPreview(@CurrentUser() user: AuthenticatedUser, @Param("storeId") storeId: string, @Param("previewId") previewId: string) {
    return this.ai.cancelPreview(user, parseRequest(uuidSchema, storeId), parseRequest(uuidSchema, previewId));
  }
}
