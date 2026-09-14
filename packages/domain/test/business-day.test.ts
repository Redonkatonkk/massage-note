import { describe, expect, it } from "vitest";
import { businessDateFor, DomainError } from "../src/index.js";

describe("营业日归属", () => {
  const base = {
    timezone: "America/New_York",
    cutoffLocal: "22:00",
  } as const;

  it("截止时间前属于本地当前日期", () => {
    expect(
      businessDateFor({ ...base, startAt: "2026-08-05T01:59:00.000Z" }),
    ).toBe("2026-08-04");
  });

  it("恰好旧截止时间仍属于当天", () => {
    expect(
      businessDateFor({ ...base, startAt: "2026-08-05T02:00:00.000Z" }),
    ).toBe("2026-08-04");
  });

  it("午夜后才属于新营业日", () => {
    expect(
      businessDateFor({ ...base, startAt: "2026-08-05T05:00:00.000Z" }),
    ).toBe("2026-08-05");
  });

  it("跨夏令时仍按店铺本地日期判断", () => {
    expect(
      businessDateFor({ ...base, startAt: "2026-03-08T07:30:00.000Z" }),
    ).toBe("2026-03-08");
  });

  it("拒绝无效时区", () => {
    expect(() =>
      businessDateFor({ ...base, timezone: "Mars/Olympus", startAt: new Date() }),
    ).toThrow(DomainError);

  });
});


it.each(["00:00", "18:00", "22:00", "25:00"])("旧截止值 %s 不影响跨年日期", (cutoffLocal) => {
  expect(businessDateFor({ timezone: "America/New_York", cutoffLocal, startAt: "2027-01-01T04:59:00Z" })).toBe("2026-12-31");
  expect(businessDateFor({ timezone: "America/New_York", cutoffLocal, startAt: "2027-01-01T05:00:00Z" })).toBe("2027-01-01");
});
