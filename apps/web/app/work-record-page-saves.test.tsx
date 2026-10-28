// @vitest-environment jsdom
import { act, useEffect, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { demoRequest } from "../demo/client";
import { ApiError, apiRequest } from "../lib/api";
import type { MeResponse, WorkRecord } from "../lib/types";
import type { WorkRecordSaveManager } from "../lib/work-record-saves";
import { useWorkRecordSaveManager } from "./work-record-save-provider";
import { MassageNoteApp } from "./massage-note-app";

vi.mock("../lib/api", async original => ({ ...await original<typeof import("../lib/api")>(), apiRequest: vi.fn() }));
vi.mock("../lib/realtime", () => ({ useStoreRealtime: () => "已同步" }));
vi.mock("./floating-ai-assistant", () => ({ FloatingAiAssistant: () => null }));
vi.mock("./app-nav", () => ({ AppNav: () => null }));
vi.mock("./business-date-picker", () => ({ BusinessDatePicker: ({ onChange }: { onChange: (date: string) => void }) => <button onClick={() => onChange("2026-10-21")}>Earlier date</button> }));
let manager: WorkRecordSaveManager;
vi.mock("./today-board", () => ({ TodayBoard: (props: { membership: MeResponse["memberships"][number]; currentDay: { businessDate: string }; accountActions: React.ReactNode; dateControls: React.ReactNode; onSaveReload: () => Promise<void> }) => {
  manager = useWorkRecordSaveManager()!;
  const storeId = props.membership.store.id, date = props.currentDay.businessDate;
  useEffect(() => manager.registerView({ storeId, businessDate: date, refresh: props.onSaveReload }), [storeId, date, props.onSaveReload]);
  return <div data-store={storeId} data-date={date}>{props.accountActions}{props.dateControls}
    <button onClick={() => manager.submit({ id: crypto.randomUUID(), storeId, businessDate: date, storeName: props.membership.store.name, employeeName: "Alex",
      request: { path: `/stores/${storeId}/work-records`, method: "POST", body: { employeeMembershipId: "employee" } },
      draft: { kind: "quick", employeeId: "employee", serviceId: "service", mode: "NORMAL", startTime: "10:00" } })}>Submit</button>
  </div>;
} }));

const request = vi.mocked(apiRequest);
const me = demoRequest("/me") as MeResponse;
const firstStore = me.memberships[0]!.store.id;
const today = "2026-10-22";
let root: Root, container: HTMLDivElement;
let resolveWrite: (record: WorkRecord) => void;
let rejectWrite: (error: unknown) => void;
const click = async (label: string) => act(async () => [...document.querySelectorAll("button")].find(button => button.textContent === label)!.click());
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => Object.assign(new EventTarget(), { matches: false }));
  window.localStorage.clear(); window.history.replaceState(null, "", "/");
  request.mockReset().mockImplementation(async (path, options) => {
    if (String(path) === "/me") return { ...me, memberships: [me.memberships[0]!, { ...me.memberships[0]!, id: "other-membership", store: { ...me.memberships[0]!.store, id: "other-store", name: "Other shop" } }] };
    if (options?.method === "POST" && String(path).endsWith("/work-records")) return new Promise((resolve, reject) => { resolveWrite = resolve; rejectWrite = reject; });
    if (String(path).endsWith("/apply-weekly-dispatch")) return {};
    const originalPath = String(path).replace("/stores/other-store", `/stores/${firstStore}`).replace("2026-10-21", today);
    return demoRequest(originalPath);
  });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.unstubAllGlobals(); });
async function render() { await act(async () => root.render(<StrictMode><MassageNoteApp /></StrictMode>)); }
async function switchStore() {
  const select = container.querySelector<HTMLSelectElement>(".store-switcher")!;
  await act(async () => { select.value = "other-store"; select.dispatchEvent(new Event("change", { bubbles: true })); });
}

it("date/store changes keep page-owned saves and never refresh the wrong scope on late acknowledgment", async () => {
  await render(); await click("Submit");
  await switchStore(); await click("Earlier date");
  expect(container.querySelector('[data-store="other-store"][data-date="2026-10-21"]')).not.toBeNull();
  request.mockClear();
  await act(async () => resolveWrite({ id: "saved", version: 2 } as WorkRecord));
  expect(request).not.toHaveBeenCalled();
  expect(manager.getSnapshot().tasks[0]).toMatchObject({ storeId: firstStore, businessDate: today, status: "saved" });
  expect(container.querySelector('[data-store="other-store"][data-date="2026-10-21"]')).not.toBeNull();
});

it("recovery waits for the current form before selecting the failed task's original store/date", async () => {
  await render(); await click("Submit"); await switchStore(); await click("Earlier date");
  await act(async () => rejectWrite(new ApiError(409, { code: "WORK_RECORD_VERSION_CONFLICT", messageZh: "Conflict" })));
  await act(async () => manager.setRestoreBlocked(true)); await click("恢复填写内容");
  expect(container.querySelector('[data-store="other-store"]')).not.toBeNull();
  await act(async () => manager.setRestoreBlocked(false));
  expect(container.querySelector(`[data-store="${firstStore}"][data-date="${today}"]`)).not.toBeNull();
  expect(manager.getSnapshot().tasks[0]!.status).toBe("failed");
});
