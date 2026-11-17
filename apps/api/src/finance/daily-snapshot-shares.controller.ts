import { Controller, Get, Header, Headers, Query } from "@nestjs/common";
import { dailySnapshotCalendarQuery, dailySnapshotDateQuery } from "@massage-note/contracts";
import { parseRequest } from "../common/zod-request.js";
import { DailySnapshotSharesService } from "./daily-snapshot-shares.service.js";

@Controller("public/daily-snapshots")
export class DailySnapshotSharesController {
  constructor(private readonly shares: DailySnapshotSharesService) {}

  @Get()
  @Header("X-Robots-Tag", "noindex, nofollow, noarchive")
  @Header("Cache-Control", "no-store")
  read(@Headers("authorization") authorization: string | undefined, @Query() query: unknown) {
    return this.shares.read(authorization, parseRequest(dailySnapshotDateQuery, query).date);
  }

  @Get("calendar")
  @Header("X-Robots-Tag", "noindex, nofollow, noarchive")
  @Header("Cache-Control", "no-store")
  calendar(@Headers("authorization") authorization: string | undefined, @Query() query: unknown) {
    return this.shares.calendar(authorization, parseRequest(dailySnapshotCalendarQuery, query).month);
  }
}
