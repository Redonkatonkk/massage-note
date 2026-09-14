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

  const local = localParts(date, input.timezone);
  return formatDate(local.year, local.month, local.day);
}
