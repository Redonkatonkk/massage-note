import { BadRequestException } from "@nestjs/common";
import type { WorkBotParsedIntent } from "@massage-note/contracts";
import { businessDateFor } from "@massage-note/domain";

export function workBotDateRange(intent: Extract<WorkBotParsedIntent, { kind: "QUERY" }>, store: { timezone: string; businessCutoffLocal: string }, now: Date) {
  const today = businessDateFor({ startAt: now, timezone: store.timezone, cutoffLocal: store.businessCutoffLocal });
  if (Boolean(intent.dateFrom) !== Boolean(intent.dateTo) || (intent.days && intent.dateFrom)) {
    throw new BadRequestException("请指定最近几天，或完整的起止营业日期");
  }
  const to = intent.dateTo ?? today;
  const end = new Date(`${to}T00:00:00.000Z`);
  const start = intent.dateFrom ? new Date(`${intent.dateFrom}T00:00:00.000Z`) : new Date(end.getTime() - ((intent.days ?? 1) - 1) * 86400000);
  const span = (end.getTime() - start.getTime()) / 86400000;
  if (!Number.isFinite(span) || span < 0 || span > 365) throw new BadRequestException("查询日期范围须为 1 至 366 天");
  return { from: start.toISOString().slice(0, 10), to, start, end };
}
