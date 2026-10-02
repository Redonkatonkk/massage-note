import { describe, expect, it } from "vitest";
import { financeCashHref, financeClosingHref, workRecordHref } from "./navigation";

describe("页面深链接", () => {
  it("现金入口合入同店同日的日结", () => {
    expect(financeCashHref("store-id", "2026-08-12")).toBe(financeClosingHref("store-id", "2026-08-12"));
  });

  it("从今日页打开指定营业日的全店日结", () => {
    expect(financeClosingHref("store-id", "2026-08-12")).toBe(
      "/finance?store=store-id&tab=closing&date=2026-08-12",
    );
  });

  it("从日结异常打开指定营业日的记工详情", () => {
    expect(workRecordHref("store-id", "2026-08-12", "record-id")).toBe(
      "/?store=store-id&date=2026-08-12&record=record-id",
    );
  });
});
