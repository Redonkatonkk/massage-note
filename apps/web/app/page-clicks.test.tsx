// @vitest-environment jsdom
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { DecisionProvider } from "./decision-dialog";
import { LanguageProvider } from "./language-provider";
import { ScrollBoundaryGuard } from "./scroll-boundary-guard";
import { NetworkStatus } from "./network-status";
import type { AppLocale } from "../lib/i18n";
import type { RealtimeChange } from "../lib/realtime-client";

vi.stubEnv("NEXT_PUBLIC_PORTFOLIO_DEMO", "true");
vi.stubEnv("NEXT_PUBLIC_APP_BASE_PATH", "");
const streams = vi.hoisted(() => new Set<(change: RealtimeChange) => void | Promise<void>>());
vi.mock("../lib/realtime", async () => {
  const { useEffect, useRef } = await import("react");
  return { useStoreRealtime: (storeId: string | undefined, handler: (change: RealtimeChange) => void | Promise<void>) => {
    const latest = useRef(handler); latest.current = handler;
    useEffect(() => {
      if (!storeId) return;
      const refresh = (change: RealtimeChange) => latest.current(change);
      streams.add(refresh); return () => { streams.delete(refresh); };
    }, [storeId]);
    return "已同步";
  } };
});

let root: Root, host: HTMLDivElement;
afterAll(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-22T16:00:00Z"));
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: query.includes("min-width: 1200px") || query.includes("prefers-reduced-motion"), addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 160, 100));
  Object.defineProperties(Element.prototype, {
    scrollTo: { configurable: true, value: function (this: HTMLElement, options: ScrollToOptions) { this.scrollLeft = options.left ?? this.scrollLeft; } },
    scrollIntoView: { configurable: true, value: () => {} },
  });
  Object.defineProperties(HTMLDialogElement.prototype, {
    showModal: { configurable: true, value: function (this: HTMLDialogElement) { this.open = true; } },
    close: { configurable: true, value: function (this: HTMLDialogElement) { this.open = false; } },
  });
  window.localStorage.clear(); window.history.replaceState(null, "", "/");
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); window.localStorage.clear();
  expect(streams.size).toBe(0);
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
  for (const name of ["scrollTo", "scrollIntoView"]) Reflect.deleteProperty(Element.prototype, name);
  for (const name of ["showModal", "close"]) Reflect.deleteProperty(HTMLDialogElement.prototype, name);
});

async function singleClick(button: HTMLButtonElement, duringPress?: () => Promise<void>) {
  expect(button, "requested button must exist").not.toBeNull();
  expect(button.disabled).toBe(false);
  const pointer = (type: string) => {
    const event = new MouseEvent(type, { bubbles: true, button: 0 });
    Object.defineProperties(event, { pointerId: { value: 1 }, isPrimary: { value: true }, pointerType: { value: "mouse" } });
    button.dispatchEvent(event);
  };
  await act(async () => {
    pointer("pointerdown");
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    button.focus();
  });
  await duringPress?.();
  expect(button.isConnected, "the pressed button must not be replaced before release").toBe(true);
  await act(async () => {
    pointer("pointerup");
    button.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, button: 0 }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, detail: 1 }));
  });
}

it("reveals only the hovered or keyboard-focused work card in a stack", async () => {
  const { window } = new JSDOM(`<div class="board" data-work-record-motion><div class="record-track" data-record-stack>
    <button class="record-card"></button><div class="record-card record-card--placeholder"><button class="record-placeholder-delete"></button></div><button class="record-card"></button>
    <button class="add-record"></button><div class="record-card record-card--right-group"><button class="record-money"></button></div>
    <div class="record-card record-card--right-group"><button class="record-money"></button></div><div class="record-card record-card--right-group"><button class="record-money"></button></div>
  </div></div>`);
  const { document, CSSMediaRule, CSSStyleRule, MouseEvent, getComputedStyle } = window;
  const track = document.querySelector(".record-track")!;
  const cards = [...track.children] as HTMLElement[];
  const style = document.createElement("style");
  style.textContent = await readFile("app/work-record-motion.css", "utf8");
  document.head.append(style);
  try {
    // jsdom does not evaluate hover input media queries. Apply the authored rules for that mode.
    const stackMedia = [...style.sheet!.cssRules].find((rule): rule is CSSMediaRule =>
      rule instanceof CSSMediaRule && rule.conditionText.includes("min-width: 761px"))!;
    style.textContent = [...stackMedia.cssRules].filter(rule => rule instanceof CSSStyleRule).map(rule => rule.cssText).join("\n");
    const openGaps = () => cards.flatMap((card, index) => {
      return getComputedStyle(card).getPropertyValue("--record-stack-gap") === "0px" ? [index] : [];
    });
    const placeholderAction = cards[1]!.querySelector("button")!;
    placeholderAction.focus();
    expect(openGaps()).toEqual([2]);
    placeholderAction.blur();
    cards[4]!.querySelector("button")!.focus();
    track.setAttribute("data-test-refresh-style", "first-right");
    expect(openGaps()).toEqual([]);
    cards[4]!.querySelector("button")!.blur();
    cards[5]!.querySelector("button")!.focus();
    track.setAttribute("data-test-refresh-style", "middle-right");
    expect(openGaps()).toEqual([5]);
    cards[5]!.querySelector("button")!.blur();
    cards[5]!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    track.setAttribute("data-test-refresh-style", "hover-right");
    expect(openGaps()).toEqual([5]);
    cards[5]!.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: track }));
    cards[1]!.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    track.setAttribute("data-test-refresh-style", ""); // Invalidate jsdom's style cache after input changes.
    expect(openGaps()).toEqual([2]);
    cards[1]!.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: track }));
    track.removeAttribute("data-test-refresh-style");
    expect(openGaps()).toEqual([]);
  } finally {
    window.close();
  }
});

it.each(["zh-CN", "en-US"] as AppLocale[])("keeps single-click navigation and dialogs working through refreshes in %s", async locale => {
  await import("../demo/client");
  const { MassageNoteApp } = await import("./massage-note-app");
  const network = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Live requests are forbidden"));
  window.localStorage.setItem("massage_note_work_record_experiment", locale === "en-US" ? "true" : "false");
  await act(async () => root.render(<StrictMode><LanguageProvider initialLocale={locale}><DecisionProvider><NetworkStatus /><ScrollBoundaryGuard /><MassageNoteApp /></DecisionProvider></LanguageProvider></StrictMode>));
  for (let index = 0; index < 20 && !host.querySelector(".board-overview"); index++) await act(async () => { await vi.advanceTimersByTimeAsync(10); });
  expect(host.querySelector(".board-overview"), host.textContent ?? "").not.toBeNull();
  const tick = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(15_000); }); };
  const backgroundRefresh = async () => { await act(async () => { await Promise.all([...streams].map(refresh => refresh({ full: true, changes: [] }))); }); };
  const toggle = () => host.querySelector<HTMLButtonElement>("button.app-nav-toggle")!;
  const queue = () => host.querySelector<HTMLButtonElement>('button.board-closing-action.secondary-action[aria-haspopup="dialog"]')!;
  const tracks = [...host.querySelectorAll<HTMLElement>(".record-track")];
  expect(tracks.map(track => track.querySelectorAll(".record-card").length)).toEqual([3, 4, 6, 4, 6]);
  expect(tracks[2]!.querySelectorAll(".record-card--right-group")).toHaveLength(1);
  for (let index = 0; index < 4; index++) {
    await singleClick(toggle(), tick);
    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    await singleClick(toggle());
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
    await singleClick(queue());
    const dialog = document.querySelector<HTMLDialogElement>("dialog[aria-label]")!;
    expect(dialog.open).toBe(true);
    await singleClick(dialog.querySelector<HTMLButtonElement>(".close-button")!, backgroundRefresh);
    expect(dialog.open).toBe(false);
    await singleClick(host.querySelector<HTMLButtonElement>(".add-record")!, backgroundRefresh);
    expect(document.querySelector(".quick-work-modal")).not.toBeNull();
    await singleClick(document.querySelector<HTMLButtonElement>(".quick-work-modal .close-button")!);
    expect(document.querySelector(".quick-work-modal")).toBeNull();
    await singleClick(host.querySelector<HTMLButtonElement>(".record-card__open")!, backgroundRefresh);
    expect(document.querySelector(".record-editor")).not.toBeNull();
    await singleClick(document.querySelector<HTMLButtonElement>(".record-editor .close-button")!);
    expect(document.querySelector(".record-editor")).toBeNull();
    const switches = host.querySelectorAll<HTMLButtonElement>(".language-switcher button");
    await singleClick([...switches].find(node => node.textContent === (document.documentElement.lang === "zh-CN" ? "English" : "中文"))!);
    const refresh = [...host.querySelectorAll<HTMLButtonElement>(".board-primary-actions > button")].find(node => node.textContent === (document.documentElement.lang === "zh-CN" ? "刷新" : "Refresh"))!;
    await singleClick(refresh);
    expect(refresh.disabled).toBe(false);
  }
  expect(network).not.toHaveBeenCalled();
  expect(host.querySelector(".decision-dialog")).toBeNull();
  expect(document.querySelector(".screen-feedback--error, .record-error-toast")).toBeNull();
}, 15_000);
