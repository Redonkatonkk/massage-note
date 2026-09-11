interface AvailableMember {
  displayName: string;
  // Only current, non-deleted pending records, from every recording source.
  workRecords: { endAt: Date | null }[];
}

export function workBotAvailability(members: AvailableMember[], now: Date, timezone: string): string {
  const idle = members.filter(member => !member.workRecords.length);
  if (idle.length) return `空闲：${idle.map(member => member.displayName).join("、")}`;

  // Overlapping records keep a member occupied until their last service ends.
  const ends = members.map(member => ({
    name: member.displayName,
    end: Math.max(...member.workRecords.map(record => record.endAt?.getTime() ?? Infinity)),
  }));
  const earliest = Math.min(...ends.map(member => member.end));
  if (!Number.isFinite(earliest)) return "全员上工｜下工时间待定";

  const day = (value: Date) => new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(value);
  const endAt = new Date(earliest);
  const time = new Intl.DateTimeFormat("zh-CN", {
    timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(endAt);
  const date = day(endAt) === day(now) ? "" : `${day(endAt)} `;
  return `全员上工｜最早下工：${ends.filter(member => member.end === earliest).map(member => member.name).join("、")} ${date}${time}（预计）`;
}
