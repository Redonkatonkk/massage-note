import { describe, expect, it } from "vitest";
import { workBotStartTime } from "../src/work-bot/work-bot-start-time.js";

describe("上工原文时间", () => {
  const now = "2026-09-09T17:28:37.000Z"; // New York 13:28
  it.each(["@Jeunesse jessie 上工，1:00 上的，一小时大力", "下午一点上的，一小时大力", "13:00 上工 大力60", "１：００ 上的 大力60"])("保留实际开始时间：%s", raw => {
    expect(workBotStartTime(raw, now, "America/New_York")?.toISOString()).toBe("2026-09-09T17:00:00.000Z");
  });
  it("没有钟点仍使用消息时间，不把时长当钟点", () => {
    expect(workBotStartTime("大力60分钟", now, "America/New_York")?.toISOString()).toBe(now);
  });
  it("显式上午和半点", () => {
    expect(workBotStartTime("上午十点半上的", now, "America/New_York")?.toISOString()).toBe("2026-09-09T14:30:00.000Z");
  });
  it("跨午夜使用最近已发生的时间", () => {
    expect(workBotStartTime("11:50 上的", "2026-09-10T04:10:00Z", "America/New_York")?.toISOString()).toBe("2026-09-10T03:50:00.000Z");
  });
  it.each(["25:00 上的", "1:80 上的", "1:0 上的", "1:00 或 2:00 上的", "昨天1:00上的", "20分钟前上工", "一小时前上工", "今天下午2:00上工"])("无法可靠确定时不写当前时间：%s", raw => {
    expect(workBotStartTime(raw, now, "America/New_York")).toBeNull();
  });
  it("拒绝夏令时跳过及重复的钟点", () => {
    expect(workBotStartTime("今天凌晨2:30上工", "2026-03-08T08:00:00Z", "America/New_York")).toBeNull();
    expect(workBotStartTime("凌晨1:30上工", "2026-11-01T07:00:00Z", "America/New_York")).toBeNull();
  });
  it("按店铺时区而非服务器时区解释", () => {
    expect(workBotStartTime("1:00上的", "2026-09-09T05:28:00Z", "Asia/Shanghai")?.toISOString()).toBe("2026-09-09T05:00:00.000Z");
  });
});
