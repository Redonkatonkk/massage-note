import { describe, expect, it } from "vitest";
import {
  adjustedEndLocalDateTime,
  endLocalDateTimeForDuration,
} from "./time";

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

  it("调整开始时间时保留当前工作时长", () => {
    expect(
      adjustedEndLocalDateTime(
        "2026-08-13T10:00",
        "2026-08-13T11:30",
        "2026-08-13T10:45",
        0,
        "America/New_York",
      ),
    ).toBe("2026-08-13T12:15");
  });

  it("增减额外项目时按配置分钟调整结束时间", () => {
    const withAddon = adjustedEndLocalDateTime(
      "2026-08-13T10:00",
      "2026-08-13T11:00",
      "2026-08-13T10:00",
      15,
      "America/New_York",
    );
    expect(withAddon).toBe("2026-08-13T11:15");
    expect(
      adjustedEndLocalDateTime(
        "2026-08-13T10:00",
        withAddon,
        "2026-08-13T10:00",
        -15,
        "America/New_York",
      ),
    ).toBe("2026-08-13T11:00");
  });
});
