// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { QuickWorkModeSwitch, type QuickWorkMode } from "./quick-work-mode-switch";

vi.mock("./language-provider", () => ({ useLanguage: () => ({ locale: "zh-CN" }) }));
let root: Root;
let container: HTMLDivElement;
let reduced = false;
let resize: () => void;
let displayed: DOMRect | null;
const animate = vi.fn();
const cancellations: ReturnType<typeof vi.fn>[] = [];

function Harness({ disabled = false, withSurface = false }: { disabled?: boolean; withSurface?: boolean }) {
  const [mode, setMode] = useState<QuickWorkMode>("NORMAL");
  const control = <QuickWorkModeSwitch value={mode} onChange={setMode} disabled={disabled} />;
  return withSurface ? <section className="quick-work-modal" data-quick-mode={mode}>{control}</section> : control;
}
function options() { return [...container.querySelectorAll<HTMLButtonElement>('[role="radio"]')]; }
async function choose(index: number) { await act(async () => options()[index]!.click()); }

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  reduced = false; displayed = null; cancellations.length = 0;
  const media = new EventTarget();
  Object.defineProperty(media, "matches", { get: () => reduced });
  vi.stubGlobal("matchMedia", vi.fn(() => media));
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { resize = callback; }
    observe() {}
    disconnect() {}
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("quick-mode-switch")) return new DOMRect(0, 0, 408, 56);
    if (this.classList.contains("quick-mode-switch__option")) return new DOMRect(4 + options().indexOf(this as HTMLButtonElement) * 100, 4, 100, 48);
    if (this.classList.contains("quick-mode-switch__capsule")) return displayed ?? new DOMRect(parseFloat(this.style.left) || 0, 4, parseFloat(this.style.width) || 0, 48);
    return new DOMRect();
  });
  animate.mockReset().mockImplementation(() => {
    const cancel = vi.fn(); cancellations.push(cancel);
    return { cancel };
  });
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it("defaults to Normal, keeps exactly one selection and supports arrow/Home/End keys", async () => {
  await act(async () => root.render(<Harness />));
  expect(options().map(option => option.getAttribute("aria-checked"))).toEqual(["true", "false", "false", "false"]);
  expect(animate).not.toHaveBeenCalled();
  await choose(2); await choose(2);
  expect(container.querySelectorAll('[aria-checked="true"]')).toHaveLength(1);
  for (const [key, expected] of [["ArrowRight", 3], ["ArrowRight", 0], ["End", 3], ["Home", 0], ["ArrowLeft", 3]] as const) {
    const selected = container.querySelector<HTMLButtonElement>('[aria-checked="true"]')!;
    await act(async () => { selected.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })); });
    expect(options()[expected]!.getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(options()[expected]);
    expect(options().filter(option => option.tabIndex === 0)).toHaveLength(1);
  }
});

it("stretches in either direction, rebounds, and uses more time for a longer trip", async () => {
  await act(async () => root.render(<Harness />));
  await choose(1);
  const nearDuration = animate.mock.calls.at(-1)![1].duration as number;
  await choose(0); await choose(3);
  const [frames, timing] = animate.mock.calls.at(-1)! as [Keyframe[], KeyframeAnimationOptions];
  expect(timing.duration).toBeGreaterThan(nearDuration);
  expect(frames[0]).toMatchObject({ left: "4px", width: "100px" });
  expect(frames.at(-1)).toMatchObject({ left: "304px", width: "100px" });
  expect(Math.max(...frames.map(frame => parseFloat(String(frame.width))))).toBeGreaterThan(200);
  expect(Math.max(...frames.map(frame => parseFloat(String(frame.left))))).toBeGreaterThan(304);
  await choose(0);
  const reverse = animate.mock.calls.at(-1)![0] as Keyframe[];
  expect(reverse.at(-1)).toMatchObject({ left: "4px", width: "100px" });
  expect(Math.min(...reverse.map(frame => parseFloat(String(frame.left))))).toBeLessThan(4);
  expect(Math.max(...reverse.map(frame => parseFloat(String(frame.width))))).toBeGreaterThan(200);
});

it("retargets from the visible capsule during rapid clicks; unchanged resize keeps motion running", async () => {
  await act(async () => root.render(<Harness />));
  await choose(1);
  await act(async () => resize());
  expect(cancellations[0]).not.toHaveBeenCalled();
  displayed = new DOMRect(50, 4, 150, 48);
  await choose(3);
  expect(cancellations[0]).toHaveBeenCalledOnce();
  expect(animate.mock.calls.at(-1)![0][0]).toMatchObject({ left: "50px", width: "150px" });
  displayed = null;
  reduced = true;
  await act(async () => resize());
  expect(cancellations[1]).toHaveBeenCalledOnce();
  expect(animate).toHaveBeenCalledTimes(2);
  expect(container.querySelector<HTMLElement>(".quick-mode-switch__capsule")!.style.left).toBe("304px");
});

it("reduced motion switches immediately and disabled controls keep the selection", async () => {
  reduced = true;
  await act(async () => root.render(<Harness />));
  await choose(3);
  expect(animate).not.toHaveBeenCalled();
  expect(options()[3]!.getAttribute("aria-checked")).toBe("true");
  await act(async () => root.render(<Harness disabled />));
  await choose(0);
  expect(options().every(option => option.disabled)).toBe(true);
  expect(options()[3]!.getAttribute("aria-checked")).toBe("true");
});

it("fades the surface and capsule for the same travel duration and retargets their visible colors", async () => {
  const palette = ["rgb(255, 255, 255)", "rgb(240, 241, 240)", "rgb(255, 248, 227)", "rgb(237, 242, 233)"];
  let visibleColor = palette[0]!;
  vi.spyOn(window, "getComputedStyle").mockImplementation(() => {
    const style = document.createElement("div").style;
    const selected = options().findIndex(option => option.getAttribute("aria-checked") === "true");
    style.setProperty("--quick-mode-color", palette[selected]!);
    style.backgroundColor = visibleColor;
    return style;
  });
  animate.mockImplementation(() => {
    const cancel = vi.fn(); cancellations.push(cancel);
    return { cancel, playState: "running" };
  });
  await act(async () => root.render(<Harness withSurface />));
  await choose(1);
  const [capsuleFrames, capsuleTiming] = animate.mock.calls[0]!;
  const [surfaceFrames, surfaceTiming] = animate.mock.calls[1]!;
  expect(capsuleFrames[0].backgroundColor).toBe(palette[0]);
  expect(capsuleFrames.at(-1).backgroundColor).toBe(palette[1]);
  expect(surfaceFrames).toEqual([{ backgroundColor: palette[0] }, { backgroundColor: palette[1] }]);
  expect(surfaceTiming.duration).toBe(capsuleTiming.duration);
  visibleColor = "rgb(250, 251, 250)";
  await choose(3);
  expect(cancellations[0]).toHaveBeenCalledOnce();
  expect(cancellations[1]).toHaveBeenCalledOnce();
  expect(animate.mock.calls[2]![0][0].backgroundColor).toBe(visibleColor);
  expect(animate.mock.calls[3]![0]).toEqual([{ backgroundColor: visibleColor }, { backgroundColor: palette[3] }]);
  expect(container.querySelector(".quick-work-modal")!.getAttribute("data-quick-mode")).toBe("HIGHLIGHTED");
  reduced = true;
  await choose(2);
  expect(cancellations[2]).toHaveBeenCalledOnce();
  expect(cancellations[3]).toHaveBeenCalledOnce();
  expect(animate).toHaveBeenCalledTimes(4);
  expect(container.querySelector(".quick-work-modal")!.getAttribute("data-quick-mode")).toBe("DISPATCH_EXCLUDED");
});
