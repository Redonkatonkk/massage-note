import { DomainError } from "./errors.js";

export interface BusinessDayInput {
  startAt: Date | string;
  timezone: string;
  cutoffLocal: string;
}

interface LocalDateTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

function parseCutoff(value: string): { hour: number; minute: number } {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    throw new DomainError("INVALID_CUTOFF", "营业日截止时间必须使用 HH:mm 格式");
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) {
    throw new DomainError("INVALID_CUTOFF", "营业日截止时间无效");
  }
  return { hour, minute };
}

function localParts(date: Date, timezone: string): LocalDateTimeParts {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    throw new DomainError("INVALID_TIMEZONE", "店铺时区无效");
  }

  const values = new Map(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );

  return {
    year: values.get("year") ?? 0,
    month: values.get("month") ?? 0,
    day: values.get("day") ?? 0,
    hour: values.get("hour") ?? 0,
    minute: values.get("minute") ?? 0,
  };
}

function formatDate(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function businessDateFor(input: BusinessDayInput): string {
  const date = input.startAt instanceof Date ? input.startAt : new Date(input.startAt);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError("startAt 不是有效时间");
  }

  const cutoff = parseCutoff(input.cutoffLocal);
  const local = localParts(date, input.timezone);
  const afterCutoff =
    local.hour > cutoff.hour ||
    (local.hour === cutoff.hour && local.minute >= cutoff.minute);

  if (!afterCutoff) {
    return formatDate(local.year, local.month, local.day);
  }

  const next = new Date(Date.UTC(local.year, local.month - 1, local.day + 1));
  return formatDate(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
  );
}

