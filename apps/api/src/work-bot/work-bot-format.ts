import { BadRequestException } from "@nestjs/common";

/** Parse a user-provided dollar amount into integer cents without floating point. */
export function parseWorkBotDollars(value: string): bigint {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value);
  if (!match) throw new BadRequestException({ code: "WORK_BOT_AMOUNT_INVALID", messageZh: "金额必须是整数或最多两位小数" });
  const cents = BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
  if (cents > BigInt(Number.MAX_SAFE_INTEGER)) throw new BadRequestException({ code: "AMOUNT_TOTAL_TOO_LARGE", messageZh: "金额超出系统允许范围" });
  return cents;
}

/** Format integer cents using the bot's existing dollar-and-cent reply style. */
export function formatWorkBotMoney(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}$${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}`;
}

/** Render a clock time in the store timezone for bot replies. */
export function formatWorkBotTime(value: Date, timezone: string): string {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(value);
}
