import { describe, expect, it } from "vitest";
import { activeWorkRecord } from "./work-status";

const record = (
  id: string,
  startAt: string,
  endAt: string | null,
  status: "PENDING_PAYMENT" | "CONFIRMED" = "PENDING_PAYMENT",
) => ({
  id,
  startAt,
  endAt,
  status,
});

describe("今日员工工作状态", () => {
  const now = Date.parse("2026-08-11T16:00:00.000Z");

  it("没有覆盖当前时间的记工时为空闲", () => {
    expect(activeWorkRecord([
      record("past", "2026-08-11T14:00:00.000Z", "2026-08-11T15:00:00.000Z"),
      record("future", "2026-08-11T17:00:00.000Z", "2026-08-11T18:00:00.000Z"),
    ], now)).toBeNull();
  });

  it("两笔待结账项目同时进行时返回下工最晚的一笔", () => {
    expect(activeWorkRecord([
      record("early", "2026-08-11T15:30:00.000Z", "2026-08-11T16:30:00.000Z"),
      record("late", "2026-08-11T15:45:00.000Z", "2026-08-11T17:00:00.000Z"),
    ], now)?.id).toBe("late");
  });

  it("所有待结账项目结清后立即恢复为空闲", () => {
    expect(activeWorkRecord([
      record(
        "confirmed",
        "2026-08-11T15:30:00.000Z",
        "2026-08-11T17:00:00.000Z",
        "CONFIRMED",
      ),
    ], now)).toBeNull();
  });

  it("混合状态时只使用仍待结账项目的下工时间", () => {
    expect(activeWorkRecord([
      record(
        "confirmed-late",
        "2026-08-11T15:30:00.000Z",
        "2026-08-11T18:00:00.000Z",
        "CONFIRMED",
      ),
      record("pending", "2026-08-11T15:45:00.000Z", "2026-08-11T16:30:00.000Z"),
    ], now)?.id).toBe("pending");
  });

  it("到达下工时间即恢复为空闲，无结束时间则保持进行中", () => {
    expect(activeWorkRecord([
      record("ended", "2026-08-11T15:00:00.000Z", "2026-08-11T16:00:00.000Z"),
    ], now)).toBeNull();
    expect(activeWorkRecord([
      record("open", "2026-08-11T15:00:00.000Z", null),
    ], now)?.id).toBe("open");
  });
});
