import { formatUsdPrecise } from "./money";
import type { EmployeeSettlementShare } from "./types";

export function settlementShareMessage(statement: EmployeeSettlementShare, url: string, locale: "zh-CN" | "en-US") {
  const en = locale === "en-US";
  return [
    `${en ? "Name: " : "姓名："}${statement.employeeName}`,
    `${en ? "Settlement dates: " : "结算日期："}${statement.dateFrom}${en ? " to " : " 至 "}${statement.dateTo}`,
    `${en ? "Total earnings: " : "合计金额："}${formatUsdPrecise(statement.totalIncomeCents)}`,
    `${en ? "Details: " : "详情链接："}${url}`,
  ].join("\n");
}
