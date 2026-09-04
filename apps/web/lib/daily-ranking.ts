export function dailyRankingActionLabel(rankedAt: string | null) {
  return rankedAt ? "重新生成今日顺序" : "生成今日顺序";
}

export function canGenerateDailyRanking(input: {
  canManage: boolean;
  enabled: boolean;
  isCurrentBusinessDay: boolean;
  isClosed: boolean;
  activeRowCount: number;
}) {
  return input.canManage &&
    input.enabled &&
    input.isCurrentBusinessDay &&
    !input.isClosed &&
    input.activeRowCount > 0;
}

export function employmentTypeLabel(type: "FULL_TIME" | "PART_TIME" | null) {
  if (type === "FULL_TIME") return "全职";
  if (type === "PART_TIME") return "兼职";
  return "未设置排工类型";
}
