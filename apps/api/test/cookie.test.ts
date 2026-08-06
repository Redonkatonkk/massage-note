import { describe, expect, it } from "vitest";
import { parseCookieHeader } from "../src/auth/cookie.js";

describe("Cookie 解析", () => {
  it("解析多个 Cookie 并保留等号后的内容", () => {
    expect(parseCookieHeader("a=1; massage_session=abc%3Ddef")).toEqual(
      new Map([
        ["a", "1"],
        ["massage_session", "abc=def"],
      ]),
    );
  });

  it("忽略编码损坏的 Cookie 而不是抛出异常", () => {
    expect(parseCookieHeader("broken=%E0%A4%A; valid=ok")).toEqual(
      new Map([["valid", "ok"]]),
    );
  });
});
