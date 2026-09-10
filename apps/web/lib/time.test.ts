import { describe, expect, it } from "vitest";
import {
  parseWorkTime,
  parseWorkTimeParts,
  formatWorkTime,
  displayTime,
  businessTimeToIso,
  adjustedEndLocalDateTime,
  zonedLocalToIso,
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

 it.each(["2026-03-08T02:30", "2026-02-30T12:00", "2026-09-08T25:00"])("拒绝不存在的当地时间 %s", (value) => {
  expect(() => zonedLocalToIso(value, "America/New_York")).toThrow();
});


describe("12 小时记工", () => {
  it.each(Array.from({ length: 12 }, (_, i) => i + 1))("按白班规则推断 %s 点", (hour) => {
    const expected = hour >= 9 && hour <= 11 ? hour : hour % 12 + 12;
    expect(parseWorkTime(String(hour))).toBe(`${String(expected).padStart(2, "0")}:00`);
    expect(parseWorkTime(`${hour}:30`)).toBe(`${String(expected).padStart(2, "0")}:30`);
  });
  it.each([["9 PM", "21:00"], ["8:15 am", "08:15"], ["12 am", "00:00"], ["12 PM", "12:00"], [" 1:05pm ", "13:05"]])("明确时段优先：%s", (input, expected) => {
    expect(parseWorkTime(input!)).toBe(expected);
  });
  it.each(["", "0", "13", "24:00", "1:60", "-1", "1:3", "1:300", "1:30xyz"])("拒绝无效输入 %s", (input) => {
    expect(parseWorkTime(input)).toBeNull();
  });
  it("所有已有钟点显示后可无损解析，不按白班规则改写历史", () => {
    for (let hour = 0; hour < 24; hour++) {
      const time = `${String(hour).padStart(2, "0")}:05`;
      expect(parseWorkTime(formatWorkTime(time))).toBe(time);
    }
  });
  it("使用店铺时区显示中午和午夜", () => {
    expect(displayTime("2026-09-09T16:00:00Z", "America/New_York")).toBe("12:00 PM");
    expect(displayTime("2026-09-09T04:00:00Z", "America/New_York")).toBe("12:00 AM");
    expect(displayTime(null, "America/New_York")).toBe("未填写");
  });
  it("推断后的下午时间仍按店铺营业日转换和计算下工", () => {
    const time = parseWorkTime("8:30")!;
    expect(businessTimeToIso("2026-09-09", time, "America/New_York", "22:00")).toBe("2026-09-10T00:30:00.000Z");
    expect(endLocalDateTimeForDuration("2026-09-09T20:30", 60, "America/New_York")).toBe("2026-09-09T21:30");
  });
});

describe("分栏时间输入", () => {
  it("支持中英文时段和单数字分钟，正确区分正午与午夜", () => {
    expect(parseWorkTimeParts("12", "0", "上午")).toBe("00:00");
    expect(parseWorkTimeParts("12", "09", "下午")).toBe("12:09");
    expect(parseWorkTimeParts("1", "5", "pm")).toBe("13:05");
    expect(parseWorkTimeParts("9", "59", "am")).toBe("09:59");
  });
  it("不接受未完成或越界输入，不推断上午下午", () => {
    for (const fields of [["", "09", "PM"], ["1", "", "PM"], ["1", "09", ""], ["0", "09", "AM"], ["13", "09", "PM"], ["1", "60", "PM"], ["1", "-1", "PM"], ["a", "09", "PM"]]) {
      expect(parseWorkTimeParts(fields[0]!, fields[1]!, fields[2]!)).toBeNull();
    }
  });
});
