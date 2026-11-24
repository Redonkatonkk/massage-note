function localMinute(now: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)!.value;
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export function dispatchDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export function nextDispatchDate(value: string) {
  const date = dispatchDate(value);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export function dispatchSmsClock(now: Date, timezone: string) {
  const local = localMinute(now, timezone);
  return { ...local, targetDate: nextDispatchDate(local.date) };
}

export function firstDispatchDate(now: Date, timezone: string, sendTimeLocal: string) {
  const { date, time } = localMinute(now, timezone);
  return dispatchDate(time < sendTimeLocal ? date : nextDispatchDate(date));
}
