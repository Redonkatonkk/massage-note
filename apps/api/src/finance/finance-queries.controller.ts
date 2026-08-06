import { Controller, Get, Param, Query, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { financeQuerySchema, uuidSchema } from "@massage-note/contracts";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { SessionAuthGuard } from "../auth/session-auth.guard.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { parseRequest } from "../common/zod-request.js";
import { FinanceQueriesService } from "./finance-queries.service.js";

@Controller("stores/:storeId/finance")
@UseGuards(SessionAuthGuard)
export class FinanceQueriesController {
  constructor(private readonly finance: FinanceQueriesService) {}

  @Get("summary")
  summary(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Query() query: unknown,
  ) {
    return this.finance.summary(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(financeQuerySchema, query),
    );
  }

  @Get("details")
  details(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Query() query: unknown,
  ) {
    return this.finance.details(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(financeQuerySchema, query),
    );
  }

  @Get("my-balance")
  myBalance(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
  ) {
    return this.finance.myBalance(user, parseRequest(uuidSchema, storeId));
  }

  @Get("export.csv")
  async exportCsv(
    @CurrentUser() user: AuthenticatedUser,
    @Param("storeId") storeId: string,
    @Query() query: unknown,
    @Res() response: Response,
  ) {
    const csv = await this.finance.exportCsv(
      user,
      parseRequest(uuidSchema, storeId),
      parseRequest(financeQuerySchema, query),
    );
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", 'attachment; filename="finance-export.csv"');
    response.send(csv);
  }
}
