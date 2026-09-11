import { describe, expect, it } from "vitest";
import { workBotAvailability } from "../src/work-bot/work-bot-availability.js";

const now = new Date("2026-09-11T19:00:00Z");
const member = (displayName: string, ...ends: (string | null)[]) => ({
  displayName, workRecords: ends.map(end => ({ endAt: end ? new Date(end) : null })),
});
const reply = (...members: ReturnType<typeof member>[]) => workBotAvailability(members, now, "America/New_York");

describe("上工回复的人员安排", () => {
  it("只列出空闲人员且不附加无关信息", () => {
    expect(reply(member("Jessica", "2026-09-11T20:00:00Z"), member("Lily"), member("Anna")))
      .toBe("空闲：Lily、Anna");
  });
  it("全员忙碌时列出最早下工者，按店铺时区显示，并保留并列人员", () => {
    expect(reply(member("Jessica", "2026-09-11T20:00:00Z"), member("Lily", "2026-09-11T19:30:00Z"), member("Anna", "2026-09-11T19:30:00Z")))
      .toBe("全员上工｜最早下工：Lily、Anna 15:30（预计）");
  });
  it("同一员工有重叠记工时使用最后结束时间", () => {
    expect(reply(member("Jessica", "2026-09-11T19:10:00Z", "2026-09-11T20:00:00Z"), member("Lily", "2026-09-11T19:30:00Z")))
      .toBe("全员上工｜最早下工：Lily 15:30（预计）");
  });
  it("结束时间未知时不虚构时间", () => {
    expect(reply(member("Jessica", null))).toBe("全员上工｜下工时间待定");
    expect(reply(member("Jessica", null, "2026-09-11T19:10:00Z"), member("Lily", "2026-09-11T19:30:00Z")))
      .toBe("全员上工｜最早下工：Lily 15:30（预计）");
  });
  it("跨店铺自然日的下工时间带日期", () => {
    expect(reply(member("Jessica", "2026-09-12T04:30:00Z")))
      .toBe("全员上工｜最早下工：Jessica 2026-09-12 00:30（预计）");
  });
});
