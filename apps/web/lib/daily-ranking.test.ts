import { describe, expect, it } from "vitest";
import {
  canGenerateDailyRanking,
  dailyRankingActionLabel,
  dailyRankingClipboardText,
} from "./daily-ranking";

describe("daily ranking UI", () => {
  it("uses distinct first-run and rerun labels", () => {
    expect(dailyRankingActionLabel(null, false)).toBe("生成所选日期顺序");
    expect(dailyRankingActionLabel("2026-09-04T09:00:00Z", false)).toBe("重新生成顺序");
    expect(dailyRankingActionLabel(null)).toBe("生成今日顺序");
    expect(dailyRankingActionLabel("2026-09-04T09:00:00Z")).toBe("重新生成今日顺序");
  });

  it("copies the selected date and current order, omitting hidden staff and renumbering", () => {
    const rows = [
      { isHidden: false, membership: { displayName: "Amy" } },
      { isHidden: true, membership: { displayName: "隐藏员工" } },
      { isHidden: false, membership: { displayName: "小明" } },
    ];
    expect(dailyRankingClipboardText("2026-11-03", rows)).toBe("2026-11-03排工顺序\n第一：Amy\n第二：小明");
    expect(dailyRankingClipboardText("2026-11-04", [rows[2]!, rows[0]!])).toBe("2026-11-04排工顺序\n第一：小明\n第二：Amy");
  });

  it("continues Chinese positions beyond nine and ninety-nine", () => {
    const rows = Array.from({ length: 110 }, (_, index) => ({ isHidden: false, membership: { displayName: `员工${index + 1}` } }));
    const lines = dailyRankingClipboardText("2026-11-03", rows).split("\n");
    for (const [position, label] of [[10, "十"], [11, "十一"], [20, "二十"], [99, "九十九"], [100, "一百"], [101, "一百零一"], [110, "一百一十"]] as const) {
      expect(lines[position]).toBe(`第${label}：员工${position}`);
    }
  });

  it("only offers ranking to managers on a non-empty current open day", () => {
    const allowed = {
      canManage: true,
      enabled: true,
      isCurrentBusinessDay: true,
      isClosed: false,
      activeRowCount: 3,
    };
    expect(canGenerateDailyRanking(allowed)).toBe(true);
    expect(canGenerateDailyRanking({ ...allowed, isCurrentBusinessDay: false, isFutureBusinessDay: true })).toBe(true);
    expect(canGenerateDailyRanking({ ...allowed, isFutureBusinessDay: true, isClosed: true })).toBe(false);
    expect(canGenerateDailyRanking({ ...allowed, canManage: false })).toBe(false);
    expect(canGenerateDailyRanking({ ...allowed, isCurrentBusinessDay: false })).toBe(false);
    expect(canGenerateDailyRanking({ ...allowed, isClosed: true })).toBe(false);
    expect(canGenerateDailyRanking({ ...allowed, activeRowCount: 0 })).toBe(false);
  });
});
