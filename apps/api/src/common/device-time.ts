import { AsyncLocalStorage } from "node:async_hooks";
import { BadRequestException } from "@nestjs/common";
import { businessDateFor as calendarDateFor } from "@massage-note/domain";
import type { Request, Response, NextFunction } from "express";

export const deviceTimeContext = new AsyncLocalStorage<{ timezone: string; now: Date }>();

export function deviceTimeMiddleware(request: Request, _response: Response, next: NextFunction) {
  const timezone = request.header("X-Device-Timezone");
  const instant = request.header("X-Device-Time");
  if (!timezone && !instant) return next();
  try {
    if (!timezone || !instant || !/^\d{4}-\d{2}-\d{2}T/.test(instant)) throw new Error();
    const now = new Date(instant);
    if (!Number.isFinite(now.getTime())) throw new Error();
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(now);
    deviceTimeContext.run({ timezone, now }, next);
  } catch {
    next(new BadRequestException("设备日期或时区无效"));
  }
}

export function deviceTimezone(fallback: string): string {
  return deviceTimeContext.getStore()?.timezone ?? fallback;
}

export function deviceNow(): Date {
  return deviceTimeContext.getStore()?.now ?? new Date();
}

export function businessDateFor(input: Parameters<typeof calendarDateFor>[0]): string {
  return calendarDateFor({ ...input, timezone: deviceTimezone(input.timezone) });
}
