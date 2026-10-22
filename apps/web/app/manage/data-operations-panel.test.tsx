// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { storeBackupTables, STORE_BACKUP_MAX_BYTES, type BackupRow, type StoreBackup, type StoreImportPreview } from "@massage-note/contracts";
import { apiRequest } from "../../lib/api";
import { clearStoreDataDrafts, downloadStoreBackup } from "../../lib/store-data";
import { translateText } from "../../lib/i18n";
import { DataOperationsPanel } from "./data-operations-panel";

vi.mock("../../lib/api", () => ({ apiRequest: vi.fn(), errorMessage: (error: Error) => error.message }));
vi.mock("../../lib/store-data", () => ({ clearStoreDataDrafts: vi.fn(), downloadStoreBackup: vi.fn() }));
const request = vi.mocked(apiRequest);
const download = vi.mocked(downloadStoreBackup);
const imported = vi.fn();
const backup: StoreBackup = { format: "massage-note-store", formatVersion: 1, appVersion: "1.35.0", mode: "anonymized", exportedAt: "2026-10-22T12:00:00.000Z", source: { storeName: "演示店铺", storeCode: "000000", dateFrom: "2026-10-01", dateTo: "2026-10-02" }, data: { store: {}, tables: Object.fromEntries(storeBackupTables.map(table => [table, [] as BackupRow[]])) as StoreBackup["data"]["tables"] }, checksum: "0".repeat(64) };
let root: Root;
let container: HTMLDivElement;
let preview: StoreImportPreview;
function button(text: string): HTMLButtonElement { return Array.from(container.querySelectorAll("button")).find(node => node.textContent === text)!; }
async function click(text: string) { await act(async () => button(text).click()); }
async function choose(content: unknown = backup, size = 100) {
  const input = container.querySelector<HTMLInputElement>("input[type=file]")!;
  const file = { size, text: async () => JSON.stringify(content) };
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}
async function confirmName(name = "Current store") {
  const input = container.querySelector<HTMLInputElement>("input[autocomplete=off]")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, name);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.clearAllMocks(); request.mockReset(); download.mockResolvedValue();
  preview = { previewId: "10000000-0000-4000-8000-000000000001", expiresAt: new Date(Date.now() + 600000).toISOString(), targetName: "Current store", targetFingerprint: "0".repeat(64), source: backup.source, mode: backup.mode, counts: Object.fromEntries(storeBackupTables.map(table => [table, 1])) as StoreImportPreview["counts"] };
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(createElement(DataOperationsPanel, { storeId: "store", memberIds: ["member"], onImported: imported })));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); });

describe("data operations workflow", () => {
  it("defaults to anonymized export and explains preserved real amounts and dates", async () => {
    expect(container.querySelector("select")?.value).toBe("anonymized");
    expect(container.textContent).toContain("金额和日期保留真实值");
    await click("下载数据文件");
    expect(download).toHaveBeenCalledWith("store", "anonymized", expect.any(AbortSignal));
    expect(translateText("数据操作", "en-US")).toBe("Data operations");
    expect(translateText("脱敏演示数据", "en-US")).toBe("Anonymized demo data");
  });
  it("requires preview, a full recovery download, saved-backup confirmation and exact store name", async () => {
    request.mockResolvedValueOnce(preview);
    await choose(); await click("校验并预览");
    expect(container.textContent).toContain("Current store");
    expect(button("确认覆盖导入").disabled).toBe(true);
    await confirmName();
    expect(button("确认覆盖导入").disabled).toBe(true);
    await click("下载覆盖前完整备份");
    expect(download).toHaveBeenCalledWith("store", "full", expect.any(AbortSignal), preview.previewId);
    await act(async () => container.querySelector<HTMLInputElement>("input[type=checkbox]")!.click());
    expect(button("确认覆盖导入").disabled).toBe(false);
    request.mockRejectedValueOnce(new Error("Conflict: recheck the preview"));
    await click("确认覆盖导入");
    expect(container.querySelector("[role=alert]")?.textContent).toContain("Conflict");
    expect(container.querySelector<HTMLInputElement>("input[autocomplete=off]")?.value).toBe("Current store");
    const key = new Headers(request.mock.calls[1]![1]?.headers).get("Idempotency-Key");
    request.mockResolvedValueOnce({ imported: true });
    await click("确认覆盖导入");
    expect(new Headers(request.mock.calls[2]![1]?.headers).get("Idempotency-Key")).toBe(key);
    expect(clearStoreDataDrafts).toHaveBeenCalledWith("store", ["member"]);
    expect(imported).toHaveBeenCalledOnce();
  });
  it("rejects malformed and oversized files before making an API request", async () => {
    await choose({ formatVersion: 99 });
    expect(container.querySelector("[role=alert]")?.textContent).toContain("格式或版本");
    await choose(backup, STORE_BACKUP_MAX_BYTES + 1);
    expect(container.querySelector("[role=alert]")?.textContent).toContain("50 MiB");
    expect(request).not.toHaveBeenCalled();
  });
  it("expires the preview and prevents further confirmation", async () => {
    preview.expiresAt = new Date(Date.now() + 100).toISOString();
    request.mockResolvedValueOnce(preview);
    await choose(); await click("校验并预览");
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 130)); });
    expect(button("确认覆盖导入")).toBeUndefined();
    expect(container.textContent).toContain("预览已过期");
  });
});
