// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { LostCustomer } from "@massage-note/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiRequest } from "../lib/api";
import { LostCustomers } from "./lost-customers";

vi.mock("../lib/api", async (original) => ({ ...await original<typeof import("../lib/api")>(), apiRequest: vi.fn() }));
vi.mock("../lib/realtime", () => ({ useStoreRealtime: () => {} }));
vi.mock("../lib/time", async (original) => ({ ...await original<typeof import("../lib/time")>(), currentStoreTime: () => "10:00" }));

const request = vi.mocked(apiRequest);
const record: LostCustomer = { id: "lost", storeId: "store", businessDate: "2026-10-06", occurredTime: "10:00", note: "等待太久", customerCount: 2, isWalkIn: true, version: 3 };
let records: LostCustomer[];
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  records = [];
  request.mockReset();
  request.mockImplementation(async (_path, options) => {
    if (!options?.method) return records.map(row => ({ ...row }));
    const input = options.body as Partial<LostCustomer>;
    if (options.method === "POST") records = [{ ...record, ...input, version: 1 }];
    if (options.method === "PATCH") records = [{ ...records[0]!, ...input, version: records[0]!.version + 1 }];
    return records[0];
  });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

async function render(canEdit = true) { await act(async () => root.render(<LostCustomers storeId="store" businessDate="2026-10-06" canEdit={canEdit} />)); }
function button(text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === text);
  if (!found) throw new Error(`Missing button ${text}`);
  return found;
}
async function click(text: string) { await act(async () => button(text).click()); }
function writes() { return request.mock.calls.filter(([, options]) => options?.method); }

describe("跑客 Walk-in", () => {
  it("选中后保存来源，刷新显示卡片角标，编辑可取消", async () => {
    await render(); await click("＋ 记录跑客");
    expect(button("Walk-in").getAttribute("aria-pressed")).toBe("false");
    await click("Walk-in"); expect(button("Walk-in").getAttribute("aria-pressed")).toBe("true");
    await click("保存");
    expect(writes()[0]).toEqual(["/stores/store/lost-customers", { method: "POST", idempotent: true, body: { businessDate: "2026-10-06", occurredTime: "10:00", customerCount: 1, note: "", isWalkIn: true } }]);
    // Reload the component from the saved server state, rather than retaining the form draft.
    await act(async () => root.render(null)); await render();
    const card = container.querySelector<HTMLButtonElement>(".lost-customers__list button")!;
    expect(card.getAttribute("aria-label")).toContain("Walk-in");
    expect(card.querySelector(".lost-customers__walk-in-icon svg")).not.toBeNull();
    await act(async () => card.click()); expect(button("Walk-in").getAttribute("aria-pressed")).toBe("true");
    await click("Walk-in"); await click("保存");
    expect(writes()[1]).toEqual(["/stores/store/lost-customers/lost", { method: "PATCH", idempotent: true, body: { version: 1, occurredTime: "10:00", customerCount: 1, note: "", isWalkIn: false } }]);
    expect(container.querySelector(".lost-customers__walk-in-icon")).toBeNull();
    expect(container.querySelector(".lost-customers__list button")!.getAttribute("aria-label")).not.toContain("Walk-in");
  });

  it("取消草稿不写入，新增记录重置来源，普通记录没有角标", async () => {
    records = [{ ...record, isWalkIn: false }]; await render();
    await act(async () => container.querySelector<HTMLButtonElement>(".lost-customers__list button")!.click());
    await click("Walk-in"); await click("取消"); expect(writes()).toEqual([]);
    await click("＋ 记录跑客"); expect(button("Walk-in").getAttribute("aria-pressed")).toBe("false");
    await click("Walk-in"); await click("取消"); await click("＋ 记录跑客");
    expect(button("Walk-in").getAttribute("aria-pressed")).toBe("false");
    expect(container.querySelector(".lost-customers__walk-in-icon")).toBeNull();
  });

  it("已日结只读卡片仍显示来源，保留时间、人数和长备注", async () => {
    records = [{ ...record, note: "很长的跑客备注".repeat(50) }]; await render(false);
    const card = container.querySelector<HTMLButtonElement>(".lost-customers__list button")!;
    expect(card.disabled).toBe(true); expect(card.getAttribute("aria-label")).toContain("查看 10:00 AM 的跑客记录 · Walk-in");
    expect(card.querySelector(".lost-customers__walk-in-icon")!.getAttribute("title")).toBe("Walk-in（直接到店）");
    expect(card.querySelector("time")!.textContent).toBe("10:00 AM");
    expect(card.textContent).toContain("2 位"); expect(card.querySelector(".lost-customers__note")!.textContent).toBe(records[0]!.note);
    expect(container.querySelector(".lost-customers__walk-in-toggle")).toBeNull();
    await act(async () => card.click()); expect(writes()).toEqual([]);
  });

  it("提交期间锁定来源并阻止重复保存，版本冲突刷新服务端标记", async () => {
    records = [{ ...record }]; await render();
    await act(async () => container.querySelector<HTMLButtonElement>(".lost-customers__list button")!.click()); await click("Walk-in");
    let rejectSave!: (error: unknown) => void;
    request.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectSave = reject; }));
    await click("保存"); expect(button("Walk-in").disabled).toBe(true);
    const form = container.querySelector("form")!;
    await act(async () => form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    expect(writes()).toHaveLength(1);
    await act(async () => rejectSave(new ApiError(409, { code: "LOST_CUSTOMER_VERSION_CONFLICT", messageZh: "版本冲突" })));
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("[role='alert']")!.textContent).toContain("重新核对");
    expect(container.querySelector(".lost-customers__walk-in-icon")).not.toBeNull();
  });
});
