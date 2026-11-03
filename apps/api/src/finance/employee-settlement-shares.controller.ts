import { Controller, Get, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { employeeSettlementShareTokenSchema } from "@massage-note/contracts";
import { parseRequest } from "../common/zod-request.js";
import { EmployeeSettlementSharesService } from "./employee-settlement-shares.service.js";

@Controller("public/employee-settlements")
export class EmployeeSettlementSharesController {
  constructor(private readonly shares: EmployeeSettlementSharesService) {}

  @Get(":token")
  read(@Param("token") token: string, @Res({ passthrough: true }) response: Response) {
    response.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    response.setHeader("Cache-Control", "no-store");
    return this.shares.read(parseRequest(employeeSettlementShareTokenSchema, token));
  }
}
