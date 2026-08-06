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

  it("恰好截止时间属于下一营业日", () => {
    expect(
      businessDateFor({ ...base, startAt: "2026-08-05T02:00:00.000Z" }),
    ).toBe("2026-08-05");
  });

  it("午夜后与前一天截止后的记录属于同一营业日", () => {
    expect(
      businessDateFor({ ...base, startAt: "2026-08-05T05:00:00.000Z" }),
    ).toBe("2026-08-05");
  });

  it("跨夏令时仍按店铺本地日期判断", () => {
    expect(
      businessDateFor({ ...base, startAt: "2026-03-08T07:30:00.000Z" }),
    ).toBe("2026-03-08");
  });

  it("拒绝无效时区和截止时间", () => {
    expect(() =>
      businessDateFor({ ...base, timezone: "Mars/Olympus", startAt: new Date() }),
    ).toThrow(DomainError);
    expect(() =>
      businessDateFor({ ...base, cutoffLocal: "25:00", startAt: new Date() }),
    ).toThrow(DomainError);
  });
});

