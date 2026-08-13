import { describe, expect, it } from "vitest";
import { endLocalDateTimeForDuration } from "./time";

describe("记工时间计算", () => {
  it("项目从 60 分钟改为 90 分钟时按开始时间重算下工时间", () => {
    expect(
      endLocalDateTimeForDuration(
        "2026-08-13T10:00",
        90,
        "America/New_York",
      ),
    ).toBe("2026-08-13T11:30");
  });
});
