import type { RealtimeChange } from "./realtime-client";

const boardEntities = new Set(["work_record", "shift", "daily_employee_row", "daily_board", "daily_cash_settlement", "business_day_closing"]);
/** Unknown entities must keep the conservative full refresh path. */
export function boardRefreshScope(change: RealtimeChange, date: string): "full" | "board" | "none" {
  if (change.full || !change.changes.length || change.changes.some(item => !boardEntities.has(item.entityType))) return "full";
  return change.changes.some(item => !item.businessDate || item.businessDate.slice(0, 10) === date) ? "board" : "none";
}

export function isWorkRecordChange(change: RealtimeChange): boolean {
  return !change.full && change.changes.length > 0 && change.changes.every(item => item.entityType === "work_record");
}
