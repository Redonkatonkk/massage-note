// @vitest-environment jsdom
import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseUiEdition, readUiEdition, UI_EDITION_COOKIE } from "../lib/ui-edition";
import { Workspace } from "./app-nav";
import { DecisionProvider, useDecision } from "./decision-dialog";
import { LanguageProvider } from "./language-provider";
import { UiEditionProvider } from "./ui-edition-provider";

let root: Root;
let host: HTMLDivElement;
const clearEdition = () => { document.cookie = `${UI_EDITION_COOKIE}=; Max-Age=0; Path=/`; };
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute("open"); };
  clearEdition();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  clearEdition();
  delete document.documentElement.dataset.uiEdition;
  window.localStorage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function edit(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
function providers(children: ReactNode) {
  return <LanguageProvider initialLocale="en-US"><UiEditionProvider initialEdition="legacy"><DecisionProvider>{children}</DecisionProvider></UiEditionProvider></LanguageProvider>;
}

it("validates the edition independently of other cookies", () => {
  expect(parseUiEdition("invalid")).toBe("legacy");
  expect(readUiEdition("massage_note_locale=en-US")).toBe("legacy");
  expect(readUiEdition(`massage_note_locale=zh-CN; ${UI_EDITION_COOKIE}=new; another=value`)).toBe("new");
});

it("puts the switch after language in both navs and keeps the current tab, URL and form draft", async () => {
  function Draft() {
    const [note, setNote] = useState("");
    return <input aria-label="Draft note" value={note} onChange={event => setNote(event.target.value)} />;
  }
  const navigation = { active: "manage", storeId: "store id", role: "EMPLOYEE", activeTab: "catalog" } as const;
  window.history.replaceState(null, "", "/manage?store=store%20id&tab=catalog&date=2026-11-04#draft");
  const url = window.location.href;
  await act(async () => root.render(providers(<Workspace className="app-shell" navigation={navigation}><Draft /></Workspace>)));
  expect(document.documentElement.dataset.uiEdition).toBe("legacy");
  const footerSwitch = host.querySelector(".app-nav-footer .edition-switcher")!;
  const drawerSwitch = host.querySelector(".workspace-menu .edition-switcher")!;
  for (const element of [footerSwitch, drawerSwitch]) expect(element.previousElementSibling?.classList.contains("language-switcher")).toBe(true);
  const input = host.querySelector("input")!;
  await act(async () => edit(input, "保留这一行 · $42.17"));
  await act(async () => footerSwitch.querySelectorAll("button")[1]!.click());
  expect(document.documentElement.dataset.uiEdition).toBe("new");
  expect(readUiEdition(document.cookie)).toBe("new");
  expect(host.querySelector("input")).toBe(input);
  expect(input.value).toBe("保留这一行 · $42.17");
  expect(window.location.href).toBe(url);
  expect(host.querySelector('.app-nav-submenu [aria-current="page"]')?.getAttribute("href")).toBe("/manage?store=store+id&tab=catalog");

  await act(async () => root.unmount());
  root = createRoot(host);
  await act(async () => root.render(providers(<Workspace className="app-shell" navigation={navigation}><Draft /></Workspace>)));
  expect(host.querySelector(".edition-switcher button:last-child")?.getAttribute("aria-pressed")).toBe("true");
  await act(async () => host.querySelector<HTMLButtonElement>(".workspace-menu-trigger")!.click());
  expect(host.querySelector<HTMLDialogElement>(".workspace-menu")?.open).toBe(true);
  await act(async () => host.querySelector<HTMLButtonElement>(".workspace-menu .edition-switcher button")!.click());
  expect(document.documentElement.dataset.uiEdition).toBe("legacy");
  expect(readUiEdition(document.cookie)).toBe("legacy");
});

it("requires the exact store name and a fresh nonblank reason, and never acts on cancel", async () => {
  document.cookie = `${UI_EDITION_COOKIE}=new; Path=/`;
  const remove = vi.fn();
  const native = vi.spyOn(window, "prompt");
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
  await act(async () => root.render(providers(<StoreAction />)));
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
  expect(native).not.toHaveBeenCalled();
});
