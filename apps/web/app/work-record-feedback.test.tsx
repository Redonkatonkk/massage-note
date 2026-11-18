// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiRequest } from "../lib/api";
import { useWorkRecordFeedback, WorkRecordFeedbackProvider } from "./work-record-feedback";

vi.mock("../lib/api", async original => ({ ...await original<typeof import("../lib/api")>(), apiRequest: vi.fn() }));
const refresh = vi.fn(async () => {});
const cancelMotion = vi.fn();
let root: Root;
let host: HTMLElement;

function Actions() {
  const { showSaved, showDeleted } = useWorkRecordFeedback();
  return <>
    <button onClick={() => showSaved(true)}>Create</button>
    <button onClick={() => showSaved(false)}>Edit</button>
    <button onClick={() => showDeleted("store", { id: "first", version: 8, status: "CONFIRMED" }, refresh, cancelMotion)}>Delete first</button>
    <button onClick={() => showDeleted("store", { id: "second", version: 3, status: "PLACEHOLDER" }, refresh, cancelMotion)}>Delete second</button>
  </>;
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.mocked(apiRequest).mockReset().mockResolvedValue(undefined);
  refresh.mockClear(); cancelMotion.mockClear();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(<WorkRecordFeedbackProvider><Actions /></WorkRecordFeedbackProvider>));
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); });
const toast = () => document.querySelector<HTMLElement>(".work-record-toast");
const progress = () => toast()?.querySelector<HTMLElement>(".work-record-toast__progress");
const click = async (label: string) => act(async () => {
  [...document.querySelectorAll("button")].find(button => button.textContent === label)!.click();
});
const tick = async (ms: number) => act(async () => vi.advanceTimersByTime(ms));

it("shows create and edit success in the same toast for two seconds", async () => {
  await click("Create");
  expect(toast()?.textContent).toContain("记工已保存");
  expect(progress()?.style.animationDuration).toBe("2000ms");
  await tick(1_999);
  await click("Edit");
  expect(toast()?.textContent).toContain("记工修改已保存");
  await tick(1_999);
  expect(toast()).not.toBeNull();
  await tick(1);
  expect(toast()).toBeNull();
});

it("keeps each undo available independently for five seconds and restores the returned version", async () => {
  await click("Delete first");
  const first = toast();
  expect(progress()?.style.animationDuration).toBe("5000ms");
  await tick(4_000);
  await click("Delete second");
  await tick(999);
  expect(first?.isConnected).toBe(true);
  await tick(1);
  expect(first?.isConnected).toBe(false);
  expect(toast()?.textContent).toContain("占位已删除");
  await click("撤销");
  expect(apiRequest).toHaveBeenCalledExactlyOnceWith("/stores/store/work-records/second/restore",
    { method: "POST", idempotent: true, body: { version: 3, undoDelete: true } });
  expect(cancelMotion).toHaveBeenCalledOnce();
  expect(refresh).toHaveBeenCalledOnce();
  expect(toast()?.textContent).toContain("删除已撤销");
});

it("keeps an undo failure in the error toast without claiming success", async () => {
  vi.mocked(apiRequest).mockRejectedValueOnce(new Error("版本冲突"));
  await click("Delete first");
  await click("撤销");
  expect(toast()).toBeNull();
  expect(document.querySelector(".record-error-toast[role=alert]")?.textContent).toBe("版本冲突");
  expect(refresh).not.toHaveBeenCalled();
});
