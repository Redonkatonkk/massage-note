import { describe, expect, it } from "vitest";
import {
  canGenerateDailyRanking,
  dailyRankingActionLabel,
  employmentTypeLabel,
} from "./daily-ranking";

describe("daily ranking UI", () => {
  it("uses distinct first-run and rerun labels", () => {
    expect(dailyRankingActionLabel(null)).toBe("生成今日顺序");
    expect(dailyRankingActionLabel("2026-09-04T09:00:00Z")).toBe("重新生成今日顺序");
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
    expect(canGenerateDailyRanking({ ...allowed, canManage: false })).toBe(false);
    expect(canGenerateDailyRanking({ ...allowed, isCurrentBusinessDay: false })).toBe(false);
    expect(canGenerateDailyRanking({ ...allowed, isClosed: true })).toBe(false);
    expect(canGenerateDailyRanking({ ...allowed, activeRowCount: 0 })).toBe(false);
  });

  it("shows employment types without per-job state", () => {
    expect(employmentTypeLabel("FULL_TIME")).toBe("全职");
    expect(employmentTypeLabel("PART_TIME")).toBe("兼职");
    expect(employmentTypeLabel(null)).toBe("未设置排工类型");
  });
});
