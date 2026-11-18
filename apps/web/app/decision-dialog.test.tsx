// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DecisionProvider, useDecision } from "./decision-dialog";
import { LanguageProvider } from "./language-provider";
import { mockNativeDialogs } from "./test-helpers/dialogs";

let root: Root;
let host: HTMLDivElement;

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mockNativeDialogs();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

function edit(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

it("requires the exact store name and a fresh nonblank reason, and never acts on cancel", async () => {
  const remove = vi.fn();
  function StoreAction() {
    const decision = useDecision();
    async function requestRemoval() {
      const store = "店铺 A";
      if (await decision.prompt("Enter the store name", { exact: store, danger: true }) !== store) return;
      const reason = await decision.prompt("Enter the reason", { required: true, danger: true });
      if (reason !== null) remove(reason.trim());
    }
    return <button type="button" onClick={() => void requestRemoval()}>Delete store</button>;
  }
  await act(async () => root.render(<LanguageProvider initialLocale="en-US"><DecisionProvider><StoreAction /></DecisionProvider></LanguageProvider>));
  const open = () => act(async () => host.querySelector("button")!.click());
  const modal = () => host.querySelector<HTMLDialogElement>(".decision-dialog")!;
  const submit = () => modal().querySelector<HTMLButtonElement>('button[type="submit"]')!;
  await open();
  expect(modal().open).toBe(true);
  await act(async () => modal().dispatchEvent(new Event("cancel", { cancelable: true })));
  expect(remove).not.toHaveBeenCalled();
  expect(modal()).toBeNull();

  await open();
  await act(async () => edit(modal().querySelector("input")!, "店铺 A "));
  expect(submit().disabled).toBe(true);
  await act(async () => edit(modal().querySelector("input")!, "店铺 A"));
  await act(async () => submit().click());
  const reason = modal().querySelector("input")!;
  expect(reason.value).toBe("");
  await act(async () => edit(reason, "  "));
  expect(submit().disabled).toBe(true);
  await act(async () => edit(reason, "  Closed permanently  "));
  await act(async () => { submit().click(); host.querySelector('button[type="submit"]')?.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
  expect(remove).toHaveBeenCalledExactlyOnceWith("Closed permanently");
});
