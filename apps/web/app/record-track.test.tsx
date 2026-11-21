// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecordTrack } from "./record-track";

let container: HTMLDivElement;
let root: Root;
let width: number;
let sideWidth: number;
let reduced: boolean;
let stackInput: EventTarget & { matches: boolean };
const resizeCallbacks = new Set<() => void>();
const moves = vi.fn();
const translations = new Map<HTMLElement, number>();

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  stackInput = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", (query: string) => query.includes("(hover: hover)") ? stackInput : {
    matches: query === "(prefers-reduced-motion: no-preference)" ? !reduced : query === "(max-width: 760px)" && width < 760,
  });
  vi.stubGlobal("ResizeObserver", class {
    constructor(private readonly callback: () => void) {}
    observe() { resizeCallbacks.add(this.callback); }
    disconnect() { resizeCallbacks.delete(this.callback); }
  });
  width = 900;
  sideWidth = 0;
  reduced = false;
  moves.mockClear();
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) {
    return 16 + Array.from(this.parentElement?.children ?? []).indexOf(this) * 189;
  });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(177);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(function (this: HTMLElement) {
    return width + (this === container ? sideWidth : 0);
  });
  vi.spyOn(HTMLElement.prototype, "scrollWidth", "get").mockImplementation(function (this: HTMLElement) {
    return Math.max(width, this.children.length * 189);
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("record-track")) return new DOMRect(10, 0, width, 132);
    return new DOMRect(10 + this.offsetLeft - (this.parentElement?.scrollLeft ?? 0) + (translations.get(this) ?? 0), 0, 177, 132);
  });
  Object.defineProperty(HTMLElement.prototype, "scrollTo", {
    configurable: true,
    value(this: HTMLElement, options: ScrollToOptions) { this.scrollLeft = options.left ?? 0; },
  });
  Object.defineProperty(HTMLElement.prototype, "animate", {
    configurable: true,
    value(this: HTMLElement, frames: Keyframe[]) {
      moves(this.dataset.motionItem, frames[0]?.translate);
      return { cancel: () => translations.delete(this), finished: new Promise<void>(() => {}) };
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  translations.clear();
  Reflect.deleteProperty(HTMLElement.prototype, "scrollTo");
  Reflect.deleteProperty(HTMLElement.prototype, "animate");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function render(ids: string[]) {
  await act(async () => root.render(
    <RecordTrack alignAddRecord movementKey={ids.join(" ")}>
      {ids.map(id => <button type="button" key={id}
        className={id === "add-record" ? id : `record-card${id.startsWith("right") ? " record-card--right-group" : ""}`}
        data-motion-item={id} data-motion-skip-in>{id}</button>)}
    </RecordTrack>
  ));
}

it("adapts the overlap to available width and enables scrolling at the 56px exposure limit", async () => {
  stackInput.matches = true;
  width = 1200;
  await render(["one", "two", "three", "four", "five", "add-record"]);
  const track = container.querySelector<HTMLElement>(".record-track")!;
  track.style.padding = "0 16px";
  track.style.columnGap = "12px";
  const resize = async (nextWidth: number) => act(async () => {
    width = nextWidth;
    for (const callback of resizeCallbacks) callback();
  });
  const stacked = () => track.hasAttribute("data-record-stack");
  const scrollable = () => track.hasAttribute("data-record-scroll");
  const inset = () => track.style.getPropertyValue("--record-stack-inset");

  expect(stacked()).toBe(false);
  expect(scrollable()).toBe(false);
  await resize(1154);
  expect(stacked()).toBe(false);
  await resize(1153);
  expect(inset()).toBe("-1px");
  await resize(900);
  expect(inset()).toBe("-64px");
  sideWidth = 142;
  await resize(622);
  expect(stacked()).toBe(true);
  expect(scrollable()).toBe(false);
  expect(inset()).toBe("-133px");
  expect(track.style.getPropertyValue("--record-stack-open-inset")).toBe("-4px");
  expect(track.hasAttribute("data-record-reveal-after")).toBe(false);
  await resize(621);
  expect(stacked()).toBe(true);
  expect(scrollable()).toBe(true);
  expect(inset()).toBe("-133px");
  expect(track.style.getPropertyValue("--record-stack-open-inset")).toBe("0px");
  expect(track.hasAttribute("data-record-reveal-after")).toBe(true);
  await resize(622);
  expect(scrollable()).toBe(false);

  await resize(900);
  await render(["one", "two", "three", "add-record"]);
  expect(stacked()).toBe(false);
  await resize(775);
  expect(stacked()).toBe(true);
  await resize(400);
  expect(scrollable()).toBe(true);
  stackInput.matches = false;
  await act(async () => { stackInput.dispatchEvent(new Event("change")); });
  expect(stacked()).toBe(false);
  expect(scrollable()).toBe(false);
});

it("compresses pairs within each group and leaves the add card and group boundaries out", async () => {
  stackInput.matches = true;
  width = 800;
  await render(["one", "two", "add-record", "right-one", "right-two"]);
  const track = container.querySelector<HTMLElement>(".record-track")!;
  expect(track.style.getPropertyValue("--record-stack-inset")).toBe("-43px");
  expect(track.style.getPropertyValue("--record-stack-open-inset")).toBe("0px");
  expect(track.hasAttribute("data-record-reveal-after")).toBe(true);
  expect(track.scrollLeft).toBe(0);

  width = 400;
  await render(["one", "add-record", "right-one"]);
  expect(track.hasAttribute("data-record-stack")).toBe(false);
  expect(track.hasAttribute("data-record-scroll")).toBe(true);
});

it("slides the add card and its neighbors from their visible positions and preserves an interrupted move", async () => {
  await render(["first", "add-record", "highlight"]);
  await render(["first", "new", "add-record", "highlight"]);
  expect(moves.mock.calls).toEqual([["add-record", "-189px 0px"], ["highlight", "-189px 0px"]]);

  translations.set(container.querySelector<HTMLElement>(".add-record")!, -90);
  moves.mockClear();
  await render(["first", "new", "another", "add-record", "highlight"]);
  expect(moves).toHaveBeenCalledWith("add-record", "-279px 0px");
  expect(moves.mock.calls.some(([id]) => id === "another")).toBe(false);
});

it("animates the visible change caused by an automatic track scroll on mobile", async () => {
  width = 320;
  await render(["first", "add-record"]);
  const track = container.querySelector<HTMLElement>(".record-track")!;
  const initialScroll = track.scrollLeft;
  expect(container.querySelector(".record-track-jump")).toBeNull();
  await render(["first", "new", "add-record"]);
  expect(track.scrollLeft - initialScroll).toBe(189);
  expect(moves.mock.calls).toEqual([["first", "189px 0px"]]);
});

it("keeps the manual position when another card is added to a scrollable stack", async () => {
  stackInput.matches = true;
  width = 370;
  await render(["first", "add-record"]);
  const track = container.querySelector<HTMLElement>(".record-track")!;
  expect(track.hasAttribute("data-record-scroll")).toBe(false);
  await render(["first", "new", "add-record"]);
  expect(track.hasAttribute("data-record-scroll")).toBe(true);
  track.scrollLeft = 20;

  await render(["first", "new", "another", "add-record"]);
  expect(track.hasAttribute("data-record-scroll")).toBe(true);
  expect(track.scrollLeft).toBe(20);
});

it("applies the new positions right away with reduced motion", async () => {
  reduced = true;
  await render(["first", "add-record"]);
  await render(["first", "new", "add-record"]);
  expect(moves).not.toHaveBeenCalled();
});
