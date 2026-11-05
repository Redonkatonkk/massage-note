import type { RankingExplanation } from "@massage-note/contracts";

export function rankingReason(entry: RankingExplanation["entries"][number], snapshot: RankingExplanation, english = false): string[] {
  const reasons: string[] = [];
  if (snapshot.schemaVersion === 2) {
    if (entry.employmentType === "FULL_TIME" && entry.leaveStartDate) reasons.push(english
      ? `Returning from leave starting ${entry.leaveStartDate}: moved to the end of the complete full-time queue, including resting staff, after today's rotation or manual internal order. This order continues on later days.`
      : `自 ${entry.leaveStartDate} 请假后首次返岗：在当天轮转或人工内部顺序基础上，移到完整全职队列末尾（包括休息人员之后），后续沿新顺序轮转。`);
    if (entry.lastPosition === null) reasons.push(english ? "No attendance history: placed after all returning employees." : "没有出勤历史，排在所有有历史人员之后。");
    else if (entry.employmentType === "FULL_TIME") reasons.push(english ? `Full-time internal position ${entry.fullTimePosition}; fills a slot left by part-time staff. Resting staff remain in the internal rotation.` : `全职内部第 ${entry.fullTimePosition} 位，依次填入兼职留下的空位；休息者仍参与内部轮转。`);
    else {
      reasons.push(english ? `Last attended on ${entry.lastBusinessDate}, at position ${entry.lastPosition}.` : `最近一次出勤是 ${entry.lastBusinessDate}，当时排第 ${entry.lastPosition}。`);
      reasons.push(entry.lastPosition === 1 ? english ? "Previously first: placed at the end of returning staff, before newcomers." : "上次第一，排在有历史人员末尾、新人之前。" : english ? `Targets position ${entry.targetPosition}; collisions move later and overflowing targets compress towards the end.` : `目标第 ${entry.targetPosition} 位；撞位顺延，超出人数时向末端压缩。`);
    }
    for (const tie of entry.ties) {
      const other = snapshot.entries.find(item => item.membershipId === tie.membershipId);
      if (other) reasons.push(english ? `Same target as ${other.displayName}: earlier attendance takes priority, with a fixed ID for exact ties.` : `与 ${other.displayName} 目标相同，上次出勤日期较早者优先，完全相同则用固定成员标识保持稳定。`);
    }
    return reasons;
  }
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
