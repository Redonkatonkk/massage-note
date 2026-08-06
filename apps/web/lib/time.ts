function partsAt(date: Date, timezone: string) {
  const values = new Map(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
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

export function localDateTimeValue(instant: string, timezone: string): string {
  const value = partsAt(new Date(instant), timezone);
  return `${value.year.toString().padStart(4, "0")}-${value.month
    .toString()
    .padStart(2, "0")}-${value.day.toString().padStart(2, "0")}T${value.hour
    .toString()
    .padStart(2, "0")}:${value.minute.toString().padStart(2, "0")}`;
}

export function zonedLocalToIso(value: string, timezone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error("日期时间格式不正确");
  const target = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
  );
  let guess = target;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = partsAt(new Date(guess), timezone);
    const actualUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
    );
    guess += target - actualUtc;
  }
  return new Date(guess).toISOString();
}

export function businessTimeToIso(
  businessDate: string,
  time: string,
  timezone: string,
  cutoffLocal: string,
): string {
  const calendar = time >= cutoffLocal
    ? new Date(`${businessDate}T00:00:00.000Z`)
    : null;
  if (calendar) calendar.setUTCDate(calendar.getUTCDate() - 1);
  const calendarDate = calendar
    ? calendar.toISOString().slice(0, 10)
    : businessDate;
  return zonedLocalToIso(`${calendarDate}T${time}`, timezone);
}

export function displayTime(instant: string | null, timezone: string): string {
  if (!instant) return "未填写";
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(instant));
}

export function currentStoreTime(timezone: string): string {
  const value = partsAt(new Date(), timezone);
  return `${value.hour.toString().padStart(2, "0")}:${value.minute
    .toString()
    .padStart(2, "0")}`;
}
