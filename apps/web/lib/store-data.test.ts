// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { clearStoreDataDrafts, downloadStoreBackup } from "./store-data";

afterEach(() => { localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it("clears only this store's current and legacy record drafts", () => {
  localStorage.setItem("massage_note_record_draft_current", JSON.stringify({ storeId: "one" }));
  localStorage.setItem("massage_note_record_draft_legacy", JSON.stringify({ employeeId: "member-one" }));
  localStorage.setItem("massage_note_record_draft_other", JSON.stringify({ storeId: "two", employeeId: "member-two" }));
  localStorage.setItem("massage_note_locale", "en-US");
  clearStoreDataDrafts("one", ["member-one"]);
  expect(localStorage.getItem("massage_note_record_draft_current")).toBeNull();
  expect(localStorage.getItem("massage_note_record_draft_legacy")).toBeNull();
  expect(localStorage.getItem("massage_note_record_draft_other")).not.toBeNull();
  expect(localStorage.getItem("massage_note_locale")).toBe("en-US");
});
it("downloads the server filename with credentials and reports structured API errors", async () => {
  const create = vi.fn(() => "blob:backup"); const revoke = vi.fn();
  vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke }));
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) { expect(this.download).toBe("massage-note-demo.json"); });
  const fetch = vi.fn().mockResolvedValueOnce(new Response("{}", { headers: { "Content-Disposition": 'attachment; filename="massage-note-demo.json"' } })).mockResolvedValueOnce(new Response(JSON.stringify({ code: "STORE_DATA_OWNER_REQUIRED", messageZh: "只有店长可以导入或导出店铺数据" }), { status: 403 }));
  vi.stubGlobal("fetch", fetch);
  await downloadStoreBackup("store", "anonymized", new AbortController().signal);
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("mode=anonymized"), expect.objectContaining({ credentials: "include" }));
  expect(click).toHaveBeenCalledOnce();
  await expect(downloadStoreBackup("store", "full", new AbortController().signal)).rejects.toMatchObject({ status: 403, code: "STORE_DATA_OWNER_REQUIRED" });
});
