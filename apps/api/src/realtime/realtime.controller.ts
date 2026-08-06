import { Controller, Headers, Param, Sse, UseGuards } from "@nestjs/common";
import { uuidSchema } from "@massage-note/contracts";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { parseRequest } from "../common/zod-request.js";
import { RealtimeService } from "./realtime.service.js";

@Controller("stores/:storeId/events")
@UseGuards(SessionAuthGuard)
export class RealtimeController {
  constructor(private readonly realtime: RealtimeService) {}

  @Sse()
  stream(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Headers("last-event-id") lastEventId: string | undefined,
  ) {
    return this.realtime.stream(
      user,
      parseRequest(uuidSchema, storeId),
      lastEventId ? parseRequest(uuidSchema, lastEventId) : undefined,
    );
  }
}
