import type { RankingExplanation } from "@massage-note/contracts";

export function rankingReason(entry: RankingExplanation["entries"][number], snapshot: RankingExplanation, english = false): string[] {
  const reasons: string[] = [];
  if (entry.lastPosition === null) {
    reasons.push(english ? "No previous ranking. Placed after everyone with ranking history." : "没有历史排位，排在所有有历史排位的员工之后。");
  } else {
    reasons.push(english
      ? `Last attended on ${entry.lastBusinessDate}, at position ${entry.lastPosition}.`
      : `最近一次出勤是 ${entry.lastBusinessDate}，当时排第 ${entry.lastPosition}。`);
    reasons.push(entry.lastPosition === 1
      ? english ? "Previously first: rotates behind the other returning employees, ahead of newcomers." : "上次第一，本次轮到有历史员工的末尾组，仍在无历史员工之前。"
      : english ? `Moves forward one place, targeting position ${entry.lastPosition - 1}. Final positions are consecutive for today's participants.` : `向前轮转一位，目标为第 ${entry.lastPosition - 1}；按今日参加人员合并排位，名次不留空号。`);
  }
  for (const tie of entry.ties) {
    const other = snapshot.entries.find((item) => item.membershipId === tie.membershipId)!;
    const rule = tie.rule === "EMPLOYMENT_TYPE"
      ? english ? "full-time takes priority over part-time" : "全职优先于兼职"
      : tie.rule === "RECENT_ATTENDANCE"
        ? english ? "same employment type; more recent attendance takes priority" : "同为全职或同为兼职，最近出勤日期较近者优先"
        : english ? "all ranking criteria match; a fixed employee identifier keeps the order stable, regardless of arrival time" : "排位条件完全相同，按固定员工标识保持顺序稳定，与加入名册早晚无关";
    reasons.push(english
      ? `Tied with ${other.displayName}: ${rule}. Placed ${tie.ahead ? "before" : "after"} ${other.displayName}.`
      : `与 ${other.displayName} 同组竞争：${rule}，因此排在 ${other.displayName} ${tie.ahead ? "前面" : "后面"}。`);
  }
  return reasons;
}

export function rankingOrderChanged(snapshot: RankingExplanation, visibleIds: string[]): boolean {
  return snapshot.entries.length !== visibleIds.length || snapshot.entries.some((entry, index) => entry.membershipId !== visibleIds[index]);
}
