// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { beginWorkRecordDeleteMotion } from "./work-record-delete-motion";
import { WORK_RECORD_BURN_SHADER } from "./work-record-burn-shader";

const vfx = vi.hoisted(() => ({ create: vi.fn(), add: vi.fn(), render: vi.fn(), remove: vi.fn(), destroy: vi.fn(), lose: vi.fn() }));
vi.mock("@vfx-js/core", () => ({
  VFX: class {
    constructor(options: { wrapper: HTMLElement }) {
      vfx.create(options);
      options.wrapper.append(document.createElement("canvas"));
    }
    add(...args: unknown[]) { return vfx.add(...args); }
    render() { return vfx.render(); }
    remove(...args: unknown[]) { vfx.remove(...args); }
    destroy() { vfx.destroy(); }
  },
}));

let track: HTMLDivElement;
let card: HTMLButtonElement;
let media: EventTarget & { matches: boolean };
let motion: ReturnType<typeof beginWorkRecordDeleteMotion> | undefined;
const animate = vi.fn();
const cancelFade = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  track = document.createElement("div"); track.className = "record-track";
  track.innerHTML = '<button class="record-card record-card--highlighted" data-work-record-id="deleted"><time id="record-time">10:00 AM</time><b>$60</b></button><button data-work-record-id="other">Other</button>';
  document.body.append(track);
  card = track.querySelector("button")!;
  media = Object.assign(new EventTarget(), { matches: false });
  vi.stubGlobal("matchMedia", () => media);
  vi.stubGlobal("OffscreenCanvas", class {});
  vi.stubGlobal("devicePixelRatio", 3);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => window.setTimeout(() => callback(performance.now()), 16));
  vi.stubGlobal("cancelAnimationFrame", (frame: number) => window.clearTimeout(frame));
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(40, 60, 160, 132));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ getExtension: () => ({ loseContext: vfx.lose }) } as unknown as WebGL2RenderingContext);
  for (const mock of Object.values(vfx)) mock.mockReset();
  vfx.add.mockImplementation(async (element: HTMLElement) => { element.style.opacity = "0"; });
  animate.mockReset().mockImplementation((_frames, timing) => ({
    finished: new Promise<void>(resolve => window.setTimeout(resolve, timing.duration)), cancel: cancelFade,
  }));
  cancelFade.mockClear();
  Object.defineProperty(Element.prototype, "animate", { configurable: true, value: animate });
});

afterEach(() => {
  motion?.cancel(); motion = undefined; track.remove(); document.body.scrollTop = 0;
  delete (Element.prototype as Partial<Element>).animate;
  vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers();
});

async function begin() {
  motion = beginWorkRecordDeleteMotion("deleted");
  await vi.advanceTimersByTimeAsync(0);
}

it("renders the actual card through VFX-JS for 500ms with no page movement or duplicate interactive card", async () => {
  document.body.scrollTop = 640; track.scrollTop = 12;
  document.documentElement.style.setProperty("--work-record-burn-ember", "#ed7939");
  await begin();
  const overlay = document.querySelector<HTMLElement>(".work-record-delete-motion")!;
  expect(overlay.getAttribute("aria-hidden")).toBe("true"); expect(overlay.inert).toBe(true);
  const slot = overlay.querySelector<HTMLElement>(".work-record-delete-motion__card")!;
  expect(slot.style.left).toBe("40px"); expect(slot.style.top).toBe("60px");
  const snapshot = slot.querySelector<HTMLElement>(".record-card--highlighted")!;
  expect(snapshot.textContent).toBe(card.textContent); expect(snapshot.querySelector("[id]")).toBeNull();
  expect(document.querySelectorAll('[data-work-record-id="deleted"]')).toHaveLength(1);
  expect(overlay.querySelector("svg")).toBeNull();
  expect(vfx.create).toHaveBeenCalledExactlyOnceWith({ autoplay: false, scrollPadding: false, pixelRatio: 2, wrapper: overlay, zIndex: 1 });
  expect(vfx.add.mock.calls[0]![0]).toBe(snapshot);
  const options = vfx.add.mock.calls[0]![1];
  expect(options.shader).toBe(WORK_RECORD_BURN_SHADER);
  expect(options.uniforms.burnColor).toEqual([237 / 255, 121 / 255, 57 / 255]);
  expect(options.uniforms.progress()).toBe(0);
  expect(card.style.visibility).toBe("hidden");
  const done = vi.fn(); void motion!.finished.then(done);
  await vi.advanceTimersByTimeAsync(250);
  expect(options.uniforms.progress()).toBeCloseTo(.5, 1);
  await vi.advanceTimersByTimeAsync(249); expect(done).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); await motion!.finished;
  expect(options.uniforms.progress()).toBe(1); expect(done).toHaveBeenCalledOnce();
  expect(vfx.remove).toHaveBeenCalledWith(snapshot); expect(vfx.destroy).toHaveBeenCalledOnce(); expect(vfx.lose).toHaveBeenCalledOnce();
  expect(document.querySelector(".work-record-delete-motion")).toBeNull();
  expect(card.style.visibility).toBe("hidden"); motion!.cancel(); expect(card.style.visibility).toBe("");
  expect(document.body.scrollTop).toBe(640); expect(track.scrollTop).toBe(12); expect(animate).not.toHaveBeenCalled();
  document.documentElement.style.removeProperty("--work-record-burn-ember");
});

it("finishes the frozen card even if realtime removes its source and auto-scrolls the track", async () => {
  await begin(); card.remove(); track.dispatchEvent(new Event("scroll")); await Promise.resolve();
  expect(document.querySelector(".work-record-delete-motion")).not.toBeNull();
  await vi.advanceTimersByTimeAsync(500); await motion!.finished;
  expect(document.querySelector(".work-record-delete-motion")).toBeNull();
});

it.each(["reduced", "missing", "unmeasurable"])("%s skips rendering", async kind => {
  if (kind === "reduced") media.matches = true;
  if (kind === "unmeasurable") vi.mocked(card.getBoundingClientRect).mockReturnValue(new DOMRect());
  motion = beginWorkRecordDeleteMotion(kind === "missing" ? "absent" : "deleted");
  await motion.finished;
  expect(vfx.create).not.toHaveBeenCalled(); expect(animate).not.toHaveBeenCalled();
  expect(card.style.visibility).toBe(""); expect(document.querySelector(".work-record-delete-motion")).toBeNull();
});

it.each(["cancel", "pagehide", "resize", "scroll", "hidden", "reduced", "unmount"])("%s releases renderer, context, frames and snapshot", async reason => {
  card.style.visibility = "visible"; await begin();
  if (reason === "cancel") motion!.cancel();
  if (reason === "pagehide" || reason === "resize") window.dispatchEvent(new Event(reason));
  if (reason === "scroll") document.dispatchEvent(new Event("scroll"));
  if (reason === "hidden") { vi.spyOn(document, "hidden", "get").mockReturnValue(true); document.dispatchEvent(new Event("visibilitychange")); }
  if (reason === "reduced") { media.matches = true; media.dispatchEvent(new Event("change")); }
  if (reason === "unmount") track.remove();
  await motion!.finished;
  expect(document.querySelector(".work-record-delete-motion")).toBeNull();
  expect(card.style.visibility).toBe("visible"); expect(vfx.destroy).toHaveBeenCalledOnce(); expect(vfx.lose).toHaveBeenCalledOnce();
  motion!.cancel(); expect(vfx.destroy).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});

it.each(["webgl", "capture", "draw", "offscreen", "context"])("%s failure falls back to a bounded fade", async kind => {
  if (kind === "webgl") vfx.create.mockImplementation(() => { throw new Error("No WebGL2"); });
  if (kind === "capture") vfx.add.mockRejectedValue(new Error("Capture failed"));
  if (kind === "draw") vfx.render.mockImplementation(() => { throw new Error("Shader failed"); });
  if (kind === "offscreen") vi.stubGlobal("OffscreenCanvas", undefined);
  await begin();
  if (kind === "context") document.querySelector("canvas")!.dispatchEvent(new Event("webglcontextlost"));
  expect(animate).toHaveBeenCalledOnce();
  expect(animate.mock.calls[0]).toEqual([[{ opacity: 1 }, { opacity: 0 }], { duration: 500, easing: "ease-out", fill: "forwards" }]);
  await vi.advanceTimersByTimeAsync(500); await motion!.finished;
  expect(document.querySelector(".work-record-delete-motion")).toBeNull(); expect(card.style.visibility).toBe("hidden");
});

it("bounds a stalled capture and ignores completion after disposal", async () => {
  let finishCapture!: () => void;
  vfx.add.mockImplementation(() => new Promise<void>(resolve => { finishCapture = resolve; }));
  await begin();
  await vi.advanceTimersByTimeAsync(249); expect(animate).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1); expect(animate).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(500); await motion!.finished;
  expect(vfx.destroy).toHaveBeenCalledOnce(); expect(document.querySelector(".work-record-delete-motion")).toBeNull();
  finishCapture(); await vi.advanceTimersByTimeAsync(0);
  expect(vfx.render).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});

it("bounds stalled fades and skips unavailable fallback animation", async () => {
  vi.stubGlobal("OffscreenCanvas", undefined);
  animate.mockImplementation(() => ({ finished: new Promise(() => {}), cancel: cancelFade }));
  await begin(); await vi.advanceTimersByTimeAsync(550); await motion!.finished;
  motion!.cancel(); expect(document.querySelector(".work-record-delete-motion")).toBeNull();
  delete (Element.prototype as Partial<Element>).animate;
  await begin(); await motion!.finished; expect(document.querySelector(".work-record-delete-motion")).toBeNull();
});

it("ignores late capture completion when the board unmounts during preparation", async () => {
  let finishCapture!: () => void;
  vfx.add.mockImplementation(() => new Promise<void>(resolve => { finishCapture = resolve; }));
  await begin(); track.remove(); await motion!.finished;
  finishCapture(); await vi.advanceTimersByTimeAsync(0);
  expect(vfx.render).not.toHaveBeenCalled(); expect(animate).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
