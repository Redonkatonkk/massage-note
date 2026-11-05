export function dailyRankingActionLabel(rankedAt: string | null, isCurrentBusinessDay = true) {
  if (!isCurrentBusinessDay) return rankedAt ? "重新生成顺序" : "生成所选日期顺序";
  return rankedAt ? "重新生成今日顺序" : "生成今日顺序";
}

function chinesePosition(position: number): string {
  const digits = "零一二三四五六七八九";
  const units = ["", "十", "百", "千"];
  if (position >= 10_000) return String(position);
  return String(position).split("").map((digit, index, all) => {
    const place = all.length - index - 1;
    if (digit === "0") return all.slice(index + 1).some(value => value !== "0") && all[index - 1] !== "0" ? "零" : "";
    return `${digits[Number(digit)]}${units[place]}`;
  }).join("").replace(/^一十/, "十");
}

export function dailyRankingClipboardText(
  businessDate: string,
  rows: readonly { isHidden: boolean; membership: { displayName: string } }[],
): string {
  return [
    `${businessDate}排工顺序`,
    ...rows.filter(row => !row.isHidden).map((row, index) =>
      `第${chinesePosition(index + 1)}：${row.membership.displayName}`),
  ].join("\n");
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
