/** Resolve a stated clock time from the original message, never from model output. */
export function workBotStartTime(rawText: string, occurredAt: string, timezone: string): Date | null {
  const text = rawText.normalize("NFKC");
  const clock = /(?<![\d:])(?:(凌晨|早上|上午|中午|下午|晚上)\s*)?(\d{1,2}|[一二三四五六七八九十两]{1,3})(?::(\d{2})(?!\d)|点(?:(半)|(\d{1,2})分?)?)/gu;
  const matches = [...text.matchAll(clock)];
  // Unsupported dates/relative times must not silently become the message time.
  if (/昨天|前天|明天|\d{4}[-/年]|\d+[月日号]|(?:分钟|小时|刻钟)[前后]/u.test(text)) return null;
  if (!matches.length) return /\d\s*:|[零一二三四五六七八九十两\d]+点|[一二三四五六七八九十两\d]+分[前后]/u.test(text) ? null : new Date(occurredAt);
  if (matches.length !== 1) return null;
  const match = matches[0]!;
  const chineseNumber = (value: string): number => {
    if (/^\d+$/u.test(value)) return Number(value);
    const digits = "零一二三四五六七八九";
    if (value === "两") return 2;
    if (value === "十") return 10;
    if (value.startsWith("十") && value.length === 2) return 10 + digits.indexOf(value[1]!);
    if (value.length === 1) return digits.indexOf(value);
    return -1;
  };
  let hour = chineseNumber(match[2]!);
  const minute = match[4] ? 30 : Number(match[3] ?? match[5] ?? 0);
  if (hour < 0 || hour > 23 || minute > 59) return null;
  const period = match[1];
  if (period) {
    if (hour > 12) return null;
    if (/下午|晚上/u.test(period)) hour = hour % 12 + 12;
    else if (/凌晨|早上|上午/u.test(period)) hour %= 12;
    else if (period === "中午" && hour < 11) hour = hour % 12 + 12;
  }
  const hours = !period && hour >= 1 && hour <= 12 ? [hour % 12, hour % 12 + 12] : [hour];
  const reference = new Date(occurredAt);
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const parts = (date: Date) => Object.fromEntries(formatter.formatToParts(date).map(p => [p.type, p.value]));
  const today = parts(reference);
  const candidates: Date[] = [];
  const limit = hours.length === 2 ? 12 * 60 : 24 * 60;
  for (let offset = 0; offset < limit; offset++) {
    const candidate = new Date(Math.floor(reference.getTime() / 60_000) * 60_000 - offset * 60_000);
    const local = parts(candidate);
    if (text.includes("今天") && (local.year !== today.year || local.month !== today.month || local.day !== today.day)) continue;
    if (hours.includes(Number(local.hour)) && Number(local.minute) === minute) candidates.push(candidate);
  }
  // Repeated DST wall times are ambiguous; ask instead of guessing an offset.
  return candidates.length === 1 ? candidates[0]! : null;
}
