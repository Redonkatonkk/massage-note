import { adjustedEndLocalDateTime } from "./time";

/** Keep both clock values on the selected service date; validate overflow visibly. */
export function adjustedSameDayEnd(start: string, end: string, nextStart: string, delta: number, timezone: string): string {
  const adjusted = adjustedEndLocalDateTime(start, end, nextStart, delta, timezone);
  return adjusted && nextStart ? `${nextStart.slice(0, 10)}T${adjusted.slice(11)}` : adjusted;
}

export function recordTimeError(start: string, end: string): string | null {
  if (!start) return "请选择服务日期和开始时间";
  if (!end) return null;
  if (start.slice(0, 10) !== end.slice(0, 10)) return "开始和结束时间必须在同一天，请调整开始时间或项目时长";
  if (end < start) return "结束时间不能早于开始时间，请调整时间或项目时长";
  return null;
}

/** Preserve recorded actual duration; fill missing end times from service snapshots. */
export function automaticRecordEnd(start: string, end: string, durationMinutes: number, timezone: string): string {
  return end || adjustedEndLocalDateTime(start, start, start, durationMinutes, timezone);
}
