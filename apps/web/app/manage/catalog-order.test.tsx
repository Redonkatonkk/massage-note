// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api";
import type { AddonItem, CatalogResponse } from "../../lib/types";
import { CatalogPanel } from "./manage-page-client";

vi.mock("../../lib/api", () => ({ apiRequest: vi.fn() }));
vi.mock("../language-provider", () => ({ useLanguage: () => ({ locale: "zh-CN", t: (value: string) => value }) }));

const request = vi.mocked(apiRequest);
const item = (id: string, position: number): AddonItem => ({
  id, name: id, shortName: id, position, version: 7, isEnabled: true, deletedAt: null,
  amountCents: 1000, defaultCommissionBps: null, durationMinutes: null,
});
let root: Root;
let container: HTMLDivElement;
let catalog: CatalogResponse;
let reload: () => Promise<void>;

function render(canManage = true) {
  root.render(<CatalogPanel storeId="store" catalog={catalog} canManage={canManage} busy={false} run={async action => action()} reload={reload} />);
}

function row(id: string) {
  return container.querySelector<HTMLElement>(`[data-catalog-sort-id="${id}"]`)!;
}

function handle(id: string) {
  return row(id).querySelector<HTMLButtonElement>(".catalog-move-handle")!;
}

function pointer(target: HTMLElement, type: string, clientY: number, pointerId = 1) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientY });
  Object.assign(event, { isPrimary: true, pointerId, pointerType: "touch" });
  target.dispatchEvent(event);
}

beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  request.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  catalog = {
    serviceItems: [{ id: "service", fullName: "Massage", shortName: "Massage", position: 0, version: 2, isEnabled: true, deletedAt: null, defaultCommissionBps: null, priceOptions: [] }],
    addonItems: [item("A", 0), { ...item("B", 1), isEnabled: false }, item("C", 2), { ...item("Deleted", 3), deletedAt: "2026-11-23" }],
    discountItems: [{ id: "discount", name: "Discount", shortName: "Discount", position: 0, version: 3, isEnabled: true, deletedAt: null, amountCents: 500, rateBps: null }],
  };
  reload = vi.fn(async () => render());
  await act(async () => render());
  for (const [index, { id }] of catalog.addonItems.slice(0, 3).entries()) {
    vi.spyOn(row(id), "getBoundingClientRect").mockReturnValue(new DOMRect(0, 100 + index * 100, 300, 90));
    handle(id).setPointerCapture = vi.fn();
  }
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.scrollTop = 0;
  vi.restoreAllMocks();
});

it("previews a multi-row touch move and saves the whole category once on release", async () => {
  expect(handle("service").disabled).toBe(true);
  expect(handle("discount").disabled).toBe(true);
  expect(container.querySelector(".deleted .catalog-move-handle")).toBeNull();
  await act(async () => {
    pointer(handle("A"), "pointerdown", 125);
    pointer(handle("A"), "pointermove", 360);
  });
  expect(handle("A").setPointerCapture).toHaveBeenCalledWith(1);
  expect(row("C").dataset.catalogDropEdge).toBe("after");
  expect(request).not.toHaveBeenCalled();

  request.mockImplementation(async () => {
    const [first, second, third, deleted] = catalog.addonItems;
    catalog.addonItems = [second!, third!, first!].map((value, position) => ({ ...value, position, version: 8 }));
    catalog.addonItems.push(deleted!);
  });
  await act(async () => {
    pointer(handle("A"), "pointerup", 360);
    pointer(handle("A"), "lostpointercapture", 360);
  });
  expect(request).toHaveBeenCalledExactlyOnceWith("/stores/store/catalog/reorder", {
    method: "POST", idempotent: true,
    body: { type: "ADDON", items: ["B", "C", "A"].map(id => ({ id, version: 7 })) },
  });
  expect([...row("A").parentElement!.querySelectorAll<HTMLElement>("[data-catalog-sort-id]")].map(element => element.dataset.catalogSortId)).toEqual(["B", "C", "A"]);
  expect(container.querySelector("[data-catalog-drop-edge]")).toBeNull();
});

it("ignores cancelled drags, taps and changes initiated outside the handle", async () => {
  await act(async () => {
    pointer(row("C"), "pointerdown", 330);
    pointer(row("C"), "pointerup", 115);
    pointer(handle("C"), "pointerdown", 330);
    pointer(handle("C"), "pointerup", 332);
    pointer(handle("C"), "pointerdown", 330);
    pointer(handle("C"), "pointermove", 115);
    pointer(handle("C"), "pointerup", 115, 2);
  });
  expect(row("A").dataset.catalogDropEdge).toBe("before");
  await act(async () => pointer(handle("C"), "pointercancel", 115));
  expect(container.querySelector("[data-catalog-dragging]")).toBeNull();
  expect(request).not.toHaveBeenCalled();
  await act(async () => render(false));
  expect(container.querySelector(".catalog-move-handle")).toBeNull();
});

it("scrolls the page body near the viewport edge during a drag", async () => {
  vi.spyOn(row("A").parentElement!, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 100, 300, window.innerHeight));
  await act(async () => {
    pointer(handle("A"), "pointerdown", 125);
    pointer(handle("A"), "pointermove", window.innerHeight - 16);
    pointer(handle("A"), "pointercancel", window.innerHeight - 16);
  });
  expect(document.body.scrollTop).toBeGreaterThan(0);
  expect(request).not.toHaveBeenCalled();
});

it("preserves a draft and keeps its handle when moving by keyboard", async () => {
  await act(async () => [...row("A").querySelectorAll("button")].find(button => button.textContent === "修改")!.click());
  const field = row("A").querySelector<HTMLInputElement>('input[aria-label="A名称"]')!;
  const originalHandle = handle("A");
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, "Draft");
    field.dispatchEvent(new Event("input", { bubbles: true }));
    originalHandle.focus();
  });
  request.mockImplementation(async () => {
    const [first, second, ...rest] = catalog.addonItems;
    catalog.addonItems = [{ ...second!, position: 0, version: 8 }, { ...first!, position: 1, version: 8 }, ...rest];
  });
  await act(async () => originalHandle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })));
  expect(request).toHaveBeenCalledExactlyOnceWith("/stores/store/catalog/reorder", {
    method: "POST", idempotent: true,
    body: { type: "ADDON", items: ["B", "A", "C"].map(id => ({ id, version: 7 })) },
  });
  expect(handle("A")).toBe(originalHandle);
  expect(document.activeElement).toBe(originalHandle);
  expect(row("A").querySelector<HTMLInputElement>('input[aria-label="A名称"]')?.value).toBe("Draft");
});
