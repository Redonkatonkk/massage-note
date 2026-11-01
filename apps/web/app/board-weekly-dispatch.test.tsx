// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { BoardWeeklyDispatch } from "./board-weekly-dispatch";
import { apiRequest } from "../lib/api";
import type { StoreMember, WeeklyDispatchConfig } from "../lib/types";
vi.mock("../lib/api", async original => ({ ...await original<typeof import("../lib/api")>(), apiRequest: vi.fn() }));
vi.mock("./language-provider", () => ({ useLanguage: () => ({ locale: "zh-CN" }) }));
const request = vi.mocked(apiRequest);
const member = (id: string, employmentType: "FULL_TIME" | "PART_TIME") => ({ id, displayName: id, status: "ACTIVE", isServiceProvider: true, employmentType, deletedAt: null }) as StoreMember;
const members = [member("P", "PART_TIME"), member("A", "FULL_TIME"), member("B", "FULL_TIME")];
let root: Root, container: HTMLDivElement;
let config: WeeklyDispatchConfig;
let requestSetup: number;
const saved = vi.fn(async () => {});
const render = async () => { await act(async () => root.render(<BoardWeeklyDispatch storeId="store" businessDate="2026-11-02" members={members} disabled={false} onSaved={saved} setupRequest={requestSetup} />)); };
const button = (text: string) => [...container.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === text)!;
const click = async (node: HTMLElement) => { await act(async () => node.click()); };
const rows = () => [...container.querySelectorAll("tbody tr")].map(row => row.querySelector("th")!.textContent!.replace("↕", ""));
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  config = { version: 4, boardVersion: 7, businessDate: "2026-11-02", effectiveFrom: null, fullTimeOrder: ["B", "A"], missingDate: null, orderReadOnly: false, schedule: { monday: ["B"], tuesday: [], wednesday: [], thursday: [], friday: [], saturday: [], sunday: [] } };
  requestSetup = 0;
  request.mockReset().mockImplementation(async (_path, options) => options?.method === "PUT" ? {} : config as never);
  saved.mockClear(); container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });
describe("weekly settings and full-time order", () => {
  it("groups employment types and saves all settings once without generating", async () => {
    await render(); await click(button("每周排工"));
    expect(rows()).toEqual(["B", "A", "P"]);
    expect(button("应用")).toBeUndefined();
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="调整 B 的全职顺序"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    expect(rows()).toEqual(["A", "B", "P"]);
    await click(container.querySelector<HTMLInputElement>('label[aria-label="B 星期一"] input')!);
    await click(button("保存设置"));
    const write = request.mock.calls.find(([, options]) => options?.method === "PUT")!;
    expect(write[0]).toBe("/stores/store/weekly-dispatch");
    expect(write[1]!.body).toMatchObject({ version: 4, boardVersion: 7, businessDate: "2026-11-02", fullTimeOrder: ["A", "B"] });
    expect((write[1]!.body as { schedule: { monday: string[] } }).schedule.monday).toEqual([]);
    expect(request.mock.calls.some(([path]) => String(path).endsWith("/rank"))).toBe(false);
    expect(saved).toHaveBeenCalledOnce();
  });
  it("cancels drafts and reloads the saved order on reopening", async () => {
    await render(); await click(button("每周排工"));
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="调整 B 的全职顺序"]')!.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
    await click(button("取消")); await click(button("每周排工"));
    expect(rows()).toEqual(["B", "A", "P"]);
    expect(request.mock.calls.filter(([, options]) => options?.method === "PUT")).toHaveLength(0);
  });
  it("moves complete rows with pointers, while checkbox interactions keep order unchanged", async () => {
    await render(); await click(button("每周排工"));
    const emit = async (node: Element, type: string) => { await act(async () => {
      const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: 2, clientY: 2 });
      Object.defineProperties(event, { isPrimary: { value: true }, pointerId: { value: 1 } }); node.dispatchEvent(event);
    }); };
    const first = container.querySelector('tr[data-full-time-id="B"]')!;
    const target = container.querySelector('tr[data-full-time-id="A"]')!;
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => target });
    await emit(first.querySelector("input")!, "pointerdown"); await emit(first, "pointermove");
    expect(rows()).toEqual(["B", "A", "P"]);
    await emit(first.querySelector("button")!, "pointerdown"); await emit(first, "pointermove"); await emit(first, "pointerup");
    expect(rows()).toEqual(["A", "B", "P"]);
  });
  it("opens initialization from the generate action and preserves the draft on conflict", async () => {
    config.fullTimeOrder = null; requestSetup = 1;
    await render();
    expect(container.querySelector("dialog")!.open).toBe(true);
    expect(container.textContent).toContain("内部顺序尚未初始化");
    request.mockRejectedValueOnce(new Error("表格已变化"));
    await click(button("保存设置"));
    expect(container.querySelector("dialog")!.open).toBe(true);
    expect(container.textContent).toContain("表格已变化");
    expect(saved).not.toHaveBeenCalled();
  });
  it("keeps closed-day order read-only while saving weekly attendance", async () => {
    config.orderReadOnly = true;
    await render(); await click(button("每周排工"));
    expect(container.querySelector<HTMLButtonElement>('.weekly-order-handle')!.disabled).toBe(true);
    await click(button("保存设置"));
    expect(request.mock.calls.find(([, options]) => options?.method === "PUT")![1]!.body).toEqual({ version: 4, schedule: config.schedule });
  });
});
