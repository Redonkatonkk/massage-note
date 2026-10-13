import { describe, expect, it } from "vitest";
import { financeClosingHref } from "./navigation";

describe("页面深链接", () => {
  it("从今日页打开指定营业日的全店日结", () => {
    expect(financeClosingHref("store-id", "2026-08-12")).toBe(
      "/finance?store=store-id&tab=closing&date=2026-08-12",
    );
  });
});
