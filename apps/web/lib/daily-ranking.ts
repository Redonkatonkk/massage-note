export function dailyRankingActionLabel(rankedAt: string | null, isCurrentBusinessDay = true) {
  if (!isCurrentBusinessDay) return rankedAt ? "重新生成所选日期顺序" : "生成所选日期顺序";
  return rankedAt ? "重新生成今日顺序" : "生成今日顺序";
}

export function canGenerateDailyRanking(input: {
  canManage: boolean;
  enabled: boolean;
  isCurrentBusinessDay: boolean;
  isFutureBusinessDay?: boolean;
  isClosed: boolean;
  activeRowCount: number;
}) {
  return input.canManage &&
    input.enabled &&
    (input.isCurrentBusinessDay || input.isFutureBusinessDay === true) &&
    !input.isClosed &&
    input.activeRowCount > 0;
}

export function employmentTypeLabel(type: "FULL_TIME" | "PART_TIME" | null) {
  if (type === "FULL_TIME") return "全职";
  if (type === "PART_TIME") return "兼职";
  return "未设置排工类型";
}
