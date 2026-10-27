// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { absorbWorkRecordDialog, beginWorkRecordSaveMotion, cancelWorkRecordSaveMotion } from "./work-record-save-motion";
import { WORK_RECORD_SAVE_SHADER } from "./work-record-save-shader";

const vfx = vi.hoisted(() => ({ create: vi.fn(), add: vi.fn(), render: vi.fn(), remove: vi.fn(), destroy: vi.fn(), lose: vi.fn() }));
vi.mock("@vfx-js/core", () => ({
  VFX: class {
    constructor(options: { wrapper: HTMLElement }) { vfx.create(options); options.wrapper.append(document.createElement("canvas")); }
    add(...args: unknown[]) { return vfx.add(...args); }
    render() { return vfx.render(); }
    remove(...args: unknown[]) { vfx.remove(...args); }
    destroy() { vfx.destroy(); }
  },
}));
let root: HTMLDivElement;
let dialog: HTMLElement;
let target: HTMLElement;
let media: EventTarget & { matches: boolean };
const animate = vi.fn(), cancelAnimation = vi.fn(), scrollIntoView = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement("div");
  root.innerHTML = '<div class="record-track"><button data-work-record-id="other"></button><button class="record-card" data-work-record-id="saved"><b>Saved $60</b></button></div><div class="modal-backdrop"><section role="dialog"><input id="draft-input" value="retained draft"></section></div>';
  document.body.append(root);
  dialog = root.querySelector("section")!; target = root.querySelector('[data-work-record-id="saved"]')!;
  media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", () => media);
  vi.stubGlobal("OffscreenCanvas", class {});
  vi.stubGlobal("innerWidth", 1000); vi.stubGlobal("innerHeight", 800); vi.stubGlobal("devicePixelRatio", 3);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal("cancelAnimationFrame", (frame: number) => window.clearTimeout(frame));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return this === dialog ? new DOMRect(100, 100, 560, 500) : new DOMRect(40, 50, 160, 132);
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ getExtension: () => ({ loseContext: vfx.lose }) } as unknown as WebGL2RenderingContext);
  for (const mock of Object.values(vfx)) mock.mockReset();
  vfx.add.mockImplementation(async (element: HTMLElement) => { element.style.opacity = "0"; });
  animate.mockReset().mockImplementation((_frames, timing) => {
    let timer: number;
    return {
      finished: new Promise<void>(resolve => { timer = window.setTimeout(resolve, timing.duration + (timing.delay ?? 0)); }),
      cancel: () => { window.clearTimeout(timer); cancelAnimation(); },
    };
  });
  cancelAnimation.mockClear(); scrollIntoView.mockClear();
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });
});

afterEach(() => {
  cancelWorkRecordSaveMotion(dialog); root.remove(); document.documentElement.lang = ""; document.body.scrollTop = 0;
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

const overlay = () => document.querySelector<HTMLElement>(".work-record-save-motion");
const sourceUniforms = () => vfx.add.mock.calls[0]![1].uniforms;
const cardUniforms = () => vfx.add.mock.calls[1]![1].uniforms;
async function start() { beginWorkRecordSaveMotion(dialog); await vi.advanceTimersByTimeAsync(0); }
async function finishFlight(id = "saved") {
  const result = absorbWorkRecordDialog(dialog, id);
  await vi.advanceTimersByTimeAsync(1000); await result;
}

it("captures the form into VFX-JS, condenses to a ring and keeps a large autonomous orbit with a visible trail", async () => {
  await start();
  expect(overlay()!.dataset.renderer).toBe("canvas"); expect(overlay()!.dataset.phase).toBe("condensing");
  expect(vfx.create.mock.calls[0]![0]).toMatchObject({ autoplay: false, scrollPadding: false, pixelRatio: 2 });
  const [snapshot, options] = vfx.add.mock.calls[0]!;
  expect(snapshot.querySelector("input").value).toBe("retained draft"); expect(snapshot.querySelector("[id]")).toBeNull();
  expect(options.shader).toBe(WORK_RECORD_SAVE_SHADER); expect(options.overflow).toBe(true);
  expect(options.uniforms.shapeRect()).toEqual([380, 350, 560, 500]);
  expect(dialog.inert).toBe(true); expect(dialog.getAttribute("aria-busy")).toBe("true"); expect(dialog.style.visibility).toBe("hidden");
  await vi.advanceTimersByTimeAsync(260); expect(overlay()!.dataset.phase).toBe("waiting");
  await vi.advanceTimersByTimeAsync(300);
  const first = [...sourceUniforms().shapeRect()];
  expect(first[0]).toBeGreaterThan(590); expect(first.slice(2)).toEqual([40, 40]);
  const trail = sourceUniforms().trail();
  expect(trail).toHaveLength(32); expect(new Set([...trail]).size).toBeGreaterThan(8); expect(sourceUniforms().trailOpacity()).toBe(1);
  document.dispatchEvent(new MouseEvent("mousemove", { clientX: 10, clientY: 20, bubbles: true }));
  window.dispatchEvent(new MouseEvent("pointermove", { clientX: 980, clientY: 780 }));
  expect(sourceUniforms().shapeRect()).toEqual(first);
  await vi.advanceTimersByTimeAsync(300);
  expect(sourceUniforms().shapeRect()[1]).toBeGreaterThan(475);
  await vi.advanceTimersByTimeAsync(1800); expect(overlay()!.dataset.phase).toBe("waiting");
  expect(vfx.add).toHaveBeenCalledOnce(); expect(scrollIntoView).not.toHaveBeenCalled(); expect(animate).not.toHaveBeenCalled();
});

it("caps the orbit to a narrow phone while keeping a visible circular path", async () => {
  vi.stubGlobal("innerWidth", 320); vi.stubGlobal("innerHeight", 640);
  await start(); await vi.advanceTimersByTimeAsync(560);
  const rect = sourceUniforms().shapeRect();
  expect(rect[0]).toBeGreaterThan(210); expect(rect[0]).toBeLessThanOrEqual(220);
  expect(rect[2]).toBe(40);
});

it("freezes visible scrolled fields and sticky header positions without moving the live form", async () => {
  dialog.innerHTML = '<header>Sticky heading</header><div><input value="scrolled draft"></div>';
  dialog.scrollTop = 380;
  const header = dialog.querySelector("header")!, fields = dialog.querySelector("div")!;
  vi.mocked(dialog.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
    if (this === dialog) return new DOMRect(100, 100, 560, 500);
    if (this === header) return new DOMRect(100, 100, 560, 40);
    if (this === fields) return new DOMRect(128, -180, 504, 240);
    return new DOMRect(40, 50, 160, 132);
  });
  await start();
  const snapshot = vfx.add.mock.calls[0]![0] as HTMLElement;
  expect(snapshot.querySelector("header")!.style.top).toBe("0px");
  expect(snapshot.querySelector("div")!.style.top).toBe("-280px");
  expect(snapshot.querySelector("div")!.style.width).toBe("504px");
  expect(snapshot.querySelector("input")!.value).toBe("scrolled draft");
  expect(dialog.scrollTop).toBe(380);
});

it("flies from the currently visible orbit, collides with the exact card and unfolds its real texture", async () => {
  await start(); await vi.advanceTimersByTimeAsync(900);
  const flight = absorbWorkRecordDialog(dialog, "saved");
  await vi.advanceTimersByTimeAsync(32);
  expect(overlay()!.dataset.phase).toBe("flying"); expect(vfx.add).toHaveBeenCalledTimes(2);
  const [snapshot, options] = vfx.add.mock.calls[1]!;
  expect(snapshot.textContent).toBe("Saved $60"); expect(snapshot.hasAttribute("data-work-record-id")).toBe(false);
  expect(options.shader).toBe(WORK_RECORD_SAVE_SHADER); expect(target.style.visibility).toBe("hidden");
  await vi.advanceTimersByTimeAsync(420);
  expect(overlay()!.dataset.phase).toBe("unfolding");
  expect(sourceUniforms().shapeRect().slice(0, 2)).toEqual([120, 116]);
  expect(sourceUniforms().impact()).toBeGreaterThanOrEqual(0);
  await vi.advanceTimersByTimeAsync(90);
  expect(cardUniforms().shapeRect()[2]).toBeGreaterThan(160); expect(cardUniforms().textureMix()).toBeGreaterThan(.7);
  await vi.advanceTimersByTimeAsync(130); await flight;
  expect(overlay()).toBeNull(); expect(target.style.visibility).toBe(""); expect(document.activeElement).toBe(target);
  expect(dialog.style.visibility).toBe("hidden"); expect(dialog.getAttribute("aria-busy")).toBeNull();
  expect(vfx.remove).toHaveBeenCalledTimes(2); expect(vfx.destroy).toHaveBeenCalledOnce(); expect(vfx.lose).toHaveBeenCalledOnce();
});

it("fast successful writes wait for the condensing phase before starting their flight", async () => {
  await start();
  const result = absorbWorkRecordDialog(dialog, "saved");
  await vi.advanceTimersByTimeAsync(259); expect(vfx.add).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(33); expect(overlay()!.dataset.phase).toBe("flying");
  await vi.advanceTimersByTimeAsync(640); await result; expect(overlay()).toBeNull();
});

it("reveals only within the horizontal track and preserves vertical page position", async () => {
  const track = target.closest<HTMLElement>(".record-track")!;
  const scroll = vi.fn(); track.scrollTo = scroll; track.scrollLeft = 20; track.scrollTop = 12; document.body.scrollTop = 640;
  vi.mocked(dialog.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
    if (this === dialog) return new DOMRect(100, 100, 560, 500);
    if (this === track) return new DOMRect(40, 50, 300, 132);
    return new DOMRect(400, 50, 160, 132);
  });
  const focus = vi.spyOn(target, "focus");
  await start(); await vi.advanceTimersByTimeAsync(260); await finishFlight();
  expect(scroll).toHaveBeenCalledExactlyOnceWith({ left: 240, behavior: "instant" });
  expect(scrollIntoView).not.toHaveBeenCalled(); expect(document.body.scrollTop).toBe(640); expect(track.scrollTop).toBe(12);
  expect(focus).toHaveBeenCalledWith({ preventScroll: true });
});

it("waits for the returned record to mount, and never unfolds into an unrelated card", async () => {
  target.remove(); await start(); await vi.advanceTimersByTimeAsync(260);
  const result = absorbWorkRecordDialog(dialog, "saved");
  await vi.advanceTimersByTimeAsync(16); expect(vfx.add).toHaveBeenCalledOnce();
  root.querySelector(".record-track")!.append(target);
  await vi.advanceTimersByTimeAsync(16); expect(vfx.add).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(640); await result;
});

it.each(["missing", "offscreen"])("%s destinations use local completion without page scrolling", async kind => {
  if (kind === "offscreen") vi.mocked(dialog.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
    return this === dialog ? new DOMRect(100, 100, 560, 500) : new DOMRect(40, -300, 160, 132);
  });
  await start(); await vi.advanceTimersByTimeAsync(260); await finishFlight(kind === "missing" ? "absent" : "saved");
  expect(vfx.add).toHaveBeenCalledOnce(); expect(scrollIntoView).not.toHaveBeenCalled(); expect(overlay()).toBeNull();
});

it("failed writes restore the filled form, focus and accessibility state", async () => {
  dialog.style.visibility = "visible"; dialog.setAttribute("aria-busy", "false");
  const input = dialog.querySelector("input")!; input.focus();
  await start(); await vi.advanceTimersByTimeAsync(1200);
  cancelWorkRecordSaveMotion(dialog);
  expect(overlay()).toBeNull(); expect(dialog.inert).not.toBe(true); expect(dialog.style.visibility).toBe("visible");
  expect(dialog.getAttribute("aria-busy")).toBe("false"); expect(input.value).toBe("retained draft"); expect(document.activeElement).toBe(input);
  expect(vfx.destroy).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});

it("reduced motion skips the renderer and looping feedback", async () => {
  media.matches = true; await start(); await absorbWorkRecordDialog(dialog, "saved");
  expect(vfx.create).not.toHaveBeenCalled(); expect(overlay()).toBeNull(); expect(animate).not.toHaveBeenCalled();
});

it.each(["unmount", "pagehide", "resize", "hidden", "reduced"])("%s cancels loops and releases resources", async reason => {
  await start(); await vi.advanceTimersByTimeAsync(260);
  if (reason === "unmount") dialog.remove();
  if (reason === "pagehide" || reason === "resize") window.dispatchEvent(new Event(reason));
  if (reason === "hidden") { vi.spyOn(document, "hidden", "get").mockReturnValue(true); document.dispatchEvent(new Event("visibilitychange")); }
  if (reason === "reduced") { media.matches = true; media.dispatchEvent(new Event("change")); }
  await vi.advanceTimersByTimeAsync(0);
  expect(overlay()).toBeNull(); expect(dialog.inert).not.toBe(true); expect(vfx.destroy).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});

it.each(["webgl", "capture", "draw", "offscreen", "context"])("%s failure leaves loading recoverable and still completes committed saves", async kind => {
  if (kind === "webgl") vfx.create.mockImplementation(() => { throw new Error("No WebGL2"); });
  if (kind === "capture") vfx.add.mockRejectedValue(new Error("Capture failed"));
  if (kind === "draw") vfx.render.mockImplementation(() => { throw new Error("Draw failed"); });
  if (kind === "offscreen") vi.stubGlobal("OffscreenCanvas", undefined);
  await start();
  if (kind === "context") document.querySelector("canvas")!.dispatchEvent(new Event("webglcontextlost"));
  expect(overlay()!.dataset.renderer).toBe("fallback"); expect(dialog.inert).toBe(true); expect(dialog.style.visibility).toBe("");
  await finishFlight();
  expect(overlay()).toBeNull(); expect(dialog.inert).not.toBe(true); expect(dialog.style.visibility).toBe("hidden");
});

it("bounds a stalled form capture and ignores its late completion", async () => {
  let finishCapture!: () => void;
  vfx.add.mockImplementation(() => new Promise<void>(resolve => { finishCapture = resolve; }));
  await start(); await vi.advanceTimersByTimeAsync(399); expect(overlay()!.dataset.renderer).toBe("pending");
  await vi.advanceTimersByTimeAsync(1); expect(overlay()!.dataset.renderer).toBe("fallback");
  await finishFlight(); finishCapture(); await vi.advanceTimersByTimeAsync(0);
  expect(vfx.render).not.toHaveBeenCalled(); expect(overlay()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
});

it("bounds a stalled destination capture and reveals the real card after impact", async () => {
  await start(); await vi.advanceTimersByTimeAsync(260);
  let finishCapture!: () => void;
  vfx.add.mockImplementationOnce(() => new Promise<void>(resolve => { finishCapture = resolve; }));
  await finishFlight();
  expect(overlay()).toBeNull(); expect(target.style.visibility).toBe("");
  finishCapture(); await vi.advanceTimersByTimeAsync(0); expect(vi.getTimerCount()).toBe(0);
});

it("cancels a pending flight without leaving a hidden destination or completion promise", async () => {
  await start(); await vi.advanceTimersByTimeAsync(260);
  const result = absorbWorkRecordDialog(dialog, "saved");
  await vi.advanceTimersByTimeAsync(32); expect(target.style.visibility).toBe("hidden");
  cancelWorkRecordSaveMotion(dialog); await result;
  expect(target.style.visibility).toBe(""); expect(dialog.style.visibility).toBe("");
  expect(overlay()).toBeNull(); expect(vi.getTimerCount()).toBe(0);
});

it("bounds completion when animation frames stop arriving", async () => {
  vi.stubGlobal("requestAnimationFrame", () => 0);
  await start(); await vi.advanceTimersByTimeAsync(260);
  const result = absorbWorkRecordDialog(dialog, "saved");
  await vi.advanceTimersByTimeAsync(740); await result;
  // jsdom schedules focus bookkeeping as a next-tick immediate.
  await vi.advanceTimersByTimeAsync(1);
  expect(overlay()).toBeNull(); expect(target.style.visibility).toBe("");
  expect(dialog.style.visibility).toBe("hidden"); expect(vi.getTimerCount()).toBe(0);
});

it("announces pending saves in English", async () => {
  document.documentElement.lang = "en-US"; await start();
  expect(document.querySelector('[role="status"]')!.textContent).toBe("Saving work record…");
});
