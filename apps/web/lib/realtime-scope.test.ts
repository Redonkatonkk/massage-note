import { expect, it } from "vitest";
import { boardRefreshScope, isWorkRecordChange } from "./realtime-scope";

it("scopes known board events by date but never drops unknown or resync notifications", () => {
  const change = { full: false, changes: [{ entityType: "work_record", businessDate: "2026-09-17T00:00:00Z" }] };
  expect(boardRefreshScope(change, "2026-09-17")).toBe("board");
  expect(boardRefreshScope(change, "2026-09-16")).toBe("none");
  expect(boardRefreshScope({ ...change, full: true }, "2026-09-16")).toBe("full");
  expect(boardRefreshScope({ full: false, changes: [{ entityType: "catalog" }] }, "2026-09-17")).toBe("full");
  expect(boardRefreshScope({ full: false, changes: [{ entityType: "work_record" }] }, "2026-09-17")).toBe("board");
  expect(isWorkRecordChange(change)).toBe(true);
  expect(isWorkRecordChange({ ...change, full: true })).toBe(false);
});
