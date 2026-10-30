// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api";
import { translateText } from "../../lib/i18n";
import type { AuditLogItem } from "../../lib/types";
import { AuditPanel } from "./manage-page-client";

vi.mock("../../lib/api", () => ({ apiRequest: vi.fn(), errorMessage: (error: Error) => error.message }));
vi.mock("../language-provider", () => ({ useLanguage: () => ({ t: (text: string) => text, locale: "zh-CN" }) }));
const request = vi.mocked(apiRequest);
const operation: AuditLogItem = { id: "operation", action: "work_record.updated", source: "api", entityType: "work_record", entityId: "record", businessDate: "2026-09-01", beforeJson: {}, afterJson: {}, reason: null, requestId: "request", createdAt: "2026-09-01T12:00:00Z", actor: null, undo: { available: true, undone: false, reason: null } };
let root: Root;
let container: HTMLDivElement;
const onUndone = vi.fn(async () => {});
const buttons = (text: string) => [...container.querySelectorAll("button")].filter(button => button.textContent === text);
async function click(text: string) { await act(async () => buttons(text)[0]!.click()); }
async function render(items = [operation]) {
  request.mockResolvedValue({ items, nextCursor: null });
  await act(async () => root.render(<AuditPanel storeId="store" members={[]} onUndone={onUndone} />));
}
beforeEach(() => {
  vi.clearAllMocks();
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(window, "confirm").mockReturnValue(true);
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

it("places Undo immediately before Details and cancellation leaves history unchanged", async () => {
  await render();
  expect([...container.querySelector(".audit-record-actions")!.children].map(node => node.textContent)).toEqual(["撤销", "详情"]);
  vi.mocked(window.confirm).mockReturnValue(false);
  await click("撤销");
  expect(request).toHaveBeenCalledTimes(1);
  expect(onUndone).not.toHaveBeenCalled();
  await click("详情");
  expect(buttons("收起")[0]!.getAttribute("aria-expanded")).toBe("true");
  expect(window.confirm).toHaveBeenCalledOnce();
});

it("locks repeated clicks, retains Details, then reloads history and related data", async () => {
  await render();
  let finish!: (value: unknown) => void;
  request.mockImplementation(async (_path, options) => options?.method === "POST" ? new Promise(resolve => { finish = resolve; }) : { items: [{ ...operation, undo: { available: false, undone: true, reason: null } }], nextCursor: null });
  await click("撤销");
  expect(buttons("撤销中…")[0]!.disabled).toBe(true);
  await click("详情");
  expect(container.querySelector("#audit-details-operation .audit-snapshots")).not.toBeNull();
  await act(async () => {
    const action = container.querySelector("select")!;
    action.value = "work_record.created"; action.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await act(async () => { buttons("撤销中…")[0]!.click(); finish({ undone: true, undoAuditLogId: "undo" }); });
  const writes = request.mock.calls.filter(([, options]) => options?.method === "POST");
  expect(writes).toHaveLength(1);
  expect(writes[0]![0]).toBe("/stores/store/audit-logs/operation/undo");
  expect(writes[0]![1]?.headers).toMatchObject({ "Idempotency-Key": expect.any(String) });
  expect(buttons("已撤销")[0]!.disabled).toBe(true);
  expect(request.mock.calls.at(-1)![0]).toContain("action=work_record.created");
  expect(onUndone).toHaveBeenCalledOnce();
});

it("shows unavailable reasons in Details and retries failures with the same key", async () => {
  await render([operation, { ...operation, id: "legacy", undo: { available: false, undone: false, reason: "这条历史记录缺少完整撤销快照" } }]);
  expect(buttons("撤销")[1]!.disabled).toBe(true);
  await act(async () => buttons("详情")[1]!.click());
  expect(container.querySelector(".audit-undo-reason")?.textContent).toContain("缺少完整撤销快照");
  request.mockRejectedValue(new Error("相关数据已发生后续修改"));
  await click("撤销"); await click("撤销");
  const writes = request.mock.calls.filter(([, options]) => options?.method === "POST");
  expect(writes).toHaveLength(2);
  expect(writes[0]![1]?.headers).toEqual(writes[1]![1]?.headers);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain("后续修改");
  expect(onUndone).not.toHaveBeenCalled();
  expect(translateText("撤销", "en-US")).toBe("Undo");
  expect(translateText("已撤销", "en-US")).toBe("Undone");
});
