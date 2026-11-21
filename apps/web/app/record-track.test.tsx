// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RecordTrack } from "./record-track";

let container: HTMLDivElement;
let root: Root;
let width: number;
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
  reduced = false;
  moves.mockClear();
  vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockImplementation(function (this: HTMLElement) {
    return 16 + Array.from(this.parentElement?.children ?? []).indexOf(this) * 189;
  });
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(177);
  vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockImplementation(() => width);
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
    <RecordTrack autoReturn movementKey={ids.join(" ")}>
      {ids.map(id => <button type="button" key={id} className={id === "add-record" ? id : "record-card"}
        data-motion-item={id} data-motion-skip-in>{id}</button>)}
    </RecordTrack>
  ));
}

it("stacks only when the full-width cards and add button overflow, including after resizing", async () => {
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

  expect(stacked()).toBe(false);
  await resize(1154);
  expect(stacked()).toBe(false);
  await resize(1153);
  expect(stacked()).toBe(true);
  await resize(1153);
  expect(stacked()).toBe(true);

  await render(["one", "two", "three", "add-record"]);
  expect(stacked()).toBe(false);
  await resize(775);
  expect(stacked()).toBe(true);
  stackInput.matches = false;
  await act(async () => { stackInput.dispatchEvent(new Event("change")); });
  expect(stacked()).toBe(false);
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
  await render(["first", "new", "add-record"]);
  expect(track.scrollLeft - initialScroll).toBe(189);
  expect(moves.mock.calls).toEqual([["first", "189px 0px"]]);
});

it("applies the new positions right away with reduced motion", async () => {
  reduced = true;
  await render(["first", "add-record"]);
  await render(["first", "new", "add-record"]);
  expect(moves).not.toHaveBeenCalled();
});
