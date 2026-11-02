// @vitest-environment jsdom
import { act, StrictMode, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PlaceholderDeleteDialog } from "./placeholder-delete-dialog";
import { ClosingDeliveryQueueButton } from "./closing-delivery-queue";
import { apiRequest } from "../lib/api";
import type { WorkRecord } from "../lib/types";

vi.mock("../lib/api", async original => ({ ...await original<typeof import("../lib/api")>(), apiRequest: vi.fn() }));
vi.mock("../lib/work-record-delete-motion", () => ({
  preloadWorkRecordDeleteMotion: vi.fn(),
  beginWorkRecordDeleteMotion: () => ({ finished: Promise.resolve(), cancel: vi.fn() }),
}));
const record = { id: "placeholder", businessDate: "2026-11-01", startAt: "2026-11-01T16:00:00Z", version: 3 } as WorkRecord;
let root: Root, container: HTMLDivElement;
const closeConnected: boolean[] = [];
const outsideAction = vi.fn(), changed = vi.fn(async () => {});
const nativeMethods = Object.fromEntries(["showModal", "close"].map(name => [name, Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, name)]));

function Page() {
  const [open, setOpen] = useState(false);
  return <>
    <button onClick={() => setOpen(true)}>Open</button>
    <button onClick={outsideAction}>Other action</button>
    {open && <PlaceholderDeleteDialog storeId="store" record={record} employeeName="Amy" timezone="America/New_York"
      canDelete isClosed={false} onClose={() => setOpen(false)} onDeleted={() => {}} onChanged={changed} />}
  </>;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  closeConnected.length = 0; outsideAction.mockClear(); changed.mockClear(); vi.mocked(apiRequest).mockReset().mockResolvedValue(undefined);
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, writable: true, value: function (this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, writable: true, value: function (this: HTMLDialogElement) { closeConnected.push(this.isConnected); this.open = false; } },
  });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks();
  for (const [name, descriptor] of Object.entries(nativeMethods)) {
    if (descriptor) Object.defineProperty(HTMLDialogElement.prototype, name, descriptor);
    else Reflect.deleteProperty(HTMLDialogElement.prototype, name);
  }
});
async function open(strict = false) {
  await act(async () => root.render(strict ? <StrictMode><Page /></StrictMode> : <Page />));
  const trigger = container.querySelector<HTMLButtonElement>("button")!;
  trigger.focus(); await act(async () => trigger.click());
  return document.querySelector<HTMLDialogElement>("dialog")!;
}

it.each(["cancel", "escape", "delete", "unmount"])("closes the native modal before removal on %s", async action => {
  const dialog = await open();
  expect(dialog.open).toBe(true);
  await act(async () => {
    if (action === "cancel") dialog.querySelector<HTMLButtonElement>(".close-button")!.click();
    else if (action === "escape") dialog.dispatchEvent(new Event("cancel", { cancelable: true }));
    else if (action === "delete") dialog.querySelector<HTMLButtonElement>(".delete-record")!.click();
    else root.render(<button onClick={outsideAction}>Other action</button>);
  });
  expect(closeConnected).toEqual([true]);
  expect(dialog.open).toBe(false);
  expect(dialog.isConnected).toBe(false);
  const other = [...container.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === "Other action")!;
  await act(async () => other.click());
  expect(outsideAction).toHaveBeenCalledOnce();
  expect(vi.mocked(apiRequest).mock.calls).toHaveLength(action === "delete" ? 1 : 0);
});

it("survives Strict Mode replay and repeated single-click opening and closing", async () => {
  await open(true);
  for (let index = 0; index < 3; index++) {
    const dialog = document.querySelector<HTMLDialogElement>("dialog")!;
    expect(dialog.open).toBe(true);
    await act(async () => dialog.querySelector<HTMLButtonElement>(".close-button")!.click());
    expect(dialog.open).toBe(false);
    expect(document.activeElement).toBe(container.querySelector("button"));
    if (index < 2) await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
  }
  expect(closeConnected.length).toBeGreaterThanOrEqual(3);
  expect(closeConnected.every(Boolean)).toBe(true);
});

it("also releases a dialog mounted by a delayed portal without closing it on ordinary rerenders", async () => {
  const props = { value: { deliveries: [], batchAllowed: true, batchBlockedReason: null, agent: null }, busy: false, onCancel: () => {} };
  await act(async () => root.render(<ClosingDeliveryQueueButton {...props} />));
  const dialog = document.querySelector<HTMLDialogElement>("dialog")!;
  await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
  expect(dialog.open).toBe(true);
  await act(async () => root.render(<ClosingDeliveryQueueButton {...props} compact />));
  expect(dialog.open).toBe(true);
  expect(closeConnected).toEqual([]);
  await act(async () => root.render(<button onClick={outsideAction}>Other action</button>));
  expect(closeConnected).toEqual([true]);
  expect(dialog.open).toBe(false);
  await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
  expect(outsideAction).toHaveBeenCalledOnce();
});
