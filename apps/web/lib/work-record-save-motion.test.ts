// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { absorbWorkRecordDialog } from "./work-record-save-motion";

let root: HTMLDivElement;
let dialog: HTMLElement;
let target: HTMLElement;
const animate = vi.fn();
const cancel = vi.fn();
const scrollIntoView = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement("div");
  root.innerHTML = '<div class="record-track"><button data-work-record-id="other"></button><button data-work-record-id="saved"></button></div><div class="modal-backdrop"><section role="dialog"></section></div>';
  document.body.append(root);
  dialog = root.querySelector("section")!; target = root.querySelector('[data-work-record-id="saved"]')!;
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 16));
  vi.stubGlobal("cancelAnimationFrame", (frame: number) => window.clearTimeout(frame));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this === dialog ? new DOMRect(100, 100, 560, 500) : new DOMRect(40, 50, 160, 132);
  });
  animate.mockReset().mockImplementation((_frames, timing) => ({
    finished: new Promise<void>(resolve => window.setTimeout(resolve, timing.duration + (timing.delay ?? 0))),
    cancel,
  }));
  cancel.mockClear(); scrollIntoView.mockClear();
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
});

afterEach(() => {
  root.remove();
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

it("flies into the exact saved card for 300ms, fades the backdrop and pulses that card", async () => {
  let completed = false;
  const flight = absorbWorkRecordDialog(dialog, "saved").then(() => { completed = true; });
  await vi.advanceTimersByTimeAsync(32);
  expect(animate.mock.contexts).toEqual([dialog, dialog.parentElement, target]);
  expect(scrollIntoView.mock.contexts).toEqual([target]);
  const [frames, timing] = animate.mock.calls[0]!;
  expect(timing.duration).toBe(300);
  expect(frames[0]).toMatchObject({ transform: "none", opacity: 1 });
  expect(frames.at(-1).transform).toContain("translate(-260px, -234px)");
  expect(frames.at(-1).opacity).toBe(0);
  expect(animate.mock.calls[1]![0].at(-1)).toEqual({ backgroundColor: "transparent" });
  expect(dialog.inert).toBe(true);
  await vi.advanceTimersByTimeAsync(299);
  expect(completed).toBe(false);
  await vi.advanceTimersByTimeAsync(1); await flight;
  expect(completed).toBe(true);
  expect(cancel).toHaveBeenCalledTimes(3);
  expect(dialog.style.visibility).toBe("hidden");
  expect(document.activeElement).toBe(target);
});

it("waits for a newly rendered card rather than choosing a different record", async () => {
  target.remove();
  const flight = absorbWorkRecordDialog(dialog, "saved");
  await vi.advanceTimersByTimeAsync(16);
  expect(animate).not.toHaveBeenCalled();
  root.querySelector(".record-track")!.append(target);
  await vi.advanceTimersByTimeAsync(16);
  expect(animate.mock.contexts[2]).toBe(target);
  await vi.advanceTimersByTimeAsync(300); await flight;
});

it.each(["reduced", "unsupported"])("%s closes immediately without moving or scrolling", async kind => {
  if (kind === "reduced") vi.stubGlobal("matchMedia", () => ({ matches: true }));
  else delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  await absorbWorkRecordDialog(dialog, "saved");
  expect(animate).not.toHaveBeenCalled(); expect(scrollIntoView).not.toHaveBeenCalled();
  expect(dialog.inert).not.toBe(true);
});

it("falls back to a local shrink when the target is absent and never pulses another card", async () => {
  const flight = absorbWorkRecordDialog(dialog, "not-on-this-page");
  await vi.advanceTimersByTimeAsync(182);
  expect(animate.mock.contexts).toEqual([dialog, dialog.parentElement]);
  expect(animate.mock.calls[0]![0].at(-1).transform).toContain("translate(0px, 24px)");
  expect(scrollIntoView).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(300); await flight;
});

it("does not hang when an interrupted animation never reports completion", async () => {
  animate.mockImplementation(() => ({ finished: new Promise(() => {}), cancel }));
  const flight = absorbWorkRecordDialog(dialog, "saved");
  await vi.advanceTimersByTimeAsync(32);
  dialog.remove();
  await vi.advanceTimersByTimeAsync(350); await flight;
  expect(cancel).toHaveBeenCalledTimes(3);
});

it("animation errors do not reject a successful save", async () => {
  animate.mockImplementation(() => { throw new Error("Animation unavailable"); });
  const flight = absorbWorkRecordDialog(dialog, "saved");
  await vi.advanceTimersByTimeAsync(32);
  await expect(flight).resolves.toBeUndefined();
});

it("does not wait indefinitely for animation frames in a background tab", async () => {
  vi.stubGlobal("requestAnimationFrame", () => 0);
  const flight = absorbWorkRecordDialog(dialog, "saved");
  await vi.advanceTimersByTimeAsync(400); await flight;
  expect(dialog.style.visibility).toBe("hidden");
});
