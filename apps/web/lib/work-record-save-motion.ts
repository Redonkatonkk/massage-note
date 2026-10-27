import type { VFX, VFXProps } from "@vfx-js/core";
import { translateText } from "./i18n";
import { WORK_RECORD_SAVE_SHADER } from "./work-record-save-shader";
import { disposeWorkRecordVfx, loadWorkRecordVfx, preloadWorkRecordVfx, workRecordVfxColor } from "./work-record-vfx";

const CONDENSE_MS = 260;
const FLIGHT_MS = 420;
const UNFOLD_MS = 220;
const PREPARE_MS = 400;
const ORB_SIZE = 40;

interface SaveMotion {
  complete: (recordId: string | undefined) => Promise<void>;
  cancel: () => void;
}
interface Pose {
  rect: [number, number, number, number];
  corner: number;
  textureMix: number;
  opacity: number;
  trailOpacity: number;
  impact: number;
}
type Point = [number, number];
const motions = new WeakMap<HTMLElement, SaveMotion>();
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => 1 - (1 - value) ** 3;
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

export function preloadWorkRecordSaveMotion(): void { preloadWorkRecordVfx(); }

function nextPaint(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise(resolve => {
    const timer = window.setTimeout(finish, 50);
    const frame = requestAnimationFrame(finish);
    function finish() {
      window.clearTimeout(timer); cancelAnimationFrame(frame);
      signal.removeEventListener("abort", finish); resolve();
    }
    signal.addEventListener("abort", finish, { once: true });
  });
}

function recordCard(recordId: string | undefined) {
  return recordId ? [...document.querySelectorAll<HTMLElement>(".record-track [data-work-record-id]")]
    .find(card => card.dataset.workRecordId === recordId) : undefined;
}

async function savedCard(recordId: string | undefined, signal: AbortSignal): Promise<HTMLElement | undefined> {
  await nextPaint(signal);
  const existing = recordCard(recordId);
  if (signal.aborted || existing || !recordId || !document.querySelector(".record-track")) return existing;
  return new Promise(resolve => {
    const observer = new MutationObserver(() => { const card = recordCard(recordId); if (card) finish(card); });
    const timer = window.setTimeout(() => finish(undefined), 150);
    const abort = () => finish(undefined);
    function finish(card: HTMLElement | undefined) {
      observer.disconnect(); window.clearTimeout(timer); signal.removeEventListener("abort", abort); resolve(card);
    }
    observer.observe(document.body, { childList: true, subtree: true });
    signal.addEventListener("abort", abort, { once: true });
  });
}

/** Freeze direct children at their visible positions, including sticky/scrolled form content. */
function frozenSnapshot(element: HTMLElement, rect: DOMRect) {
  const snapshot = element.cloneNode(true) as HTMLElement;
  for (const [index, child] of [...element.children].entries()) {
    const copy = snapshot.children[index];
    if (!(child instanceof HTMLElement) || !(copy instanceof HTMLElement)) continue;
    const box = child.getBoundingClientRect();
    Object.assign(copy.style, {
      position: "absolute", left: box.left - rect.left + "px", top: box.top - rect.top + "px",
      width: box.width + "px", height: box.height + "px", margin: "0",
    });
  }
  for (const node of [snapshot, ...snapshot.querySelectorAll("[id], [data-work-record-id], [autofocus]")]) {
    node.removeAttribute("id"); node.removeAttribute("data-work-record-id"); node.removeAttribute("autofocus");
  }
  snapshot.setAttribute("aria-hidden", "true"); snapshot.inert = true;
  Object.assign(snapshot.style, {
    position: "relative", width: rect.width + "px", height: rect.height + "px", minWidth: "0", minHeight: "0",
    maxWidth: "none", maxHeight: "none", margin: "0", overflow: "hidden", opacity: "1", visibility: "visible",
    transform: "none", transition: "none", animation: "none",
  });
  const slot = document.createElement("div");
  slot.className = "work-record-save-motion__slot";
  Object.assign(slot.style, { left: rect.left + "px", top: rect.top + "px", width: rect.width + "px", height: rect.height + "px", opacity: "0" });
  slot.append(snapshot);
  return { snapshot, slot };
}

/** Local validation has passed; animation starts before the write and never implies success. */
export function beginWorkRecordSaveMotion(dialog: HTMLElement | null): void {
  if (!dialog) return;
  cancelWorkRecordSaveMotion(dialog);
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (!dialog.isConnected || reduced?.matches) return;
  const from = dialog.getBoundingClientRect();
  if (from.width <= 0 || from.height <= 0) return;
  const controller = new AbortController();
  const { signal } = controller;
  const previous = { inert: dialog.inert, visibility: dialog.style.visibility, busy: dialog.getAttribute("aria-busy"), focus: document.activeElement };
  const overlay = document.createElement("div");
  overlay.className = "work-record-save-motion"; overlay.setAttribute("role", "status"); overlay.dataset.renderer = "pending";
  const stage = document.createElement("div"); stage.className = "work-record-save-motion__stage"; stage.setAttribute("aria-hidden", "true"); stage.inert = true;
  const status = document.createElement("span"); status.className = "work-record-save-motion__status";
  status.textContent = translateText("正在保存记工…", document.documentElement.lang === "en-US" ? "en-US" : "zh-CN");
  const fallback = document.createElement("div"); fallback.className = "work-record-save-motion__fallback"; fallback.setAttribute("aria-hidden", "true");
  overlay.append(stage, fallback, status);
  const center: Point = [window.innerWidth / 2, window.innerHeight / 2];
  const orbitRadius = Math.min(100, Math.max(60, window.innerWidth * .18), window.innerHeight * .2);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const sourcePose: Pose = { rect: [from.left + from.width / 2, from.top + from.height / 2, from.width, from.height], corner: 12, textureMix: 1, opacity: 1, trailOpacity: 0, impact: -1 };
  const cardPose: Pose = { rect: [...center, ORB_SIZE, ORB_SIZE], corner: 20, textureMix: 0, opacity: 0, trailOpacity: 0, impact: -1 };
  const sources: HTMLElement[] = [];
  const trail = new Float32Array(32);
  const history: { at: number; point: Point }[] = [];
  let renderer: VFX | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let frame: number | undefined;
  let prepareTimer: number | undefined;
  let completed = false;
  let completing = false;
  let degraded = false;
  let waiting = false;
  let orbitStarted = 0;
  let target: HTMLElement | undefined;
  let targetVisibility: string | undefined;
  let stopTween: ((atEnd?: boolean) => void) | undefined;
  let timeline: { start: number; duration: number; update: (progress: number) => void } | undefined;
  let resolveReady!: () => void;
  const ready = new Promise<void>(resolve => { resolveReady = resolve; });
  const animations: Animation[] = [];
  const backdrop = dialog.closest<HTMLElement>(".modal-backdrop");
  const observer = new MutationObserver(() => { if (!dialog.isConnected) cancel(); });

  const releaseRenderer = () => {
    const instance = renderer; renderer = undefined;
    disposeWorkRecordVfx(instance, sources, canvas); canvas = undefined;
  };
  const cancel = () => {
    if (signal.aborted) return;
    controller.abort(); window.clearTimeout(prepareTimer); stopTween?.(false); resolveReady();
    if (frame !== undefined) cancelAnimationFrame(frame);
    releaseRenderer(); for (const animation of animations) animation.cancel();
    observer.disconnect(); overlay.remove();
    reduced?.removeEventListener("change", cancel); window.removeEventListener("pagehide", cancel); window.removeEventListener("resize", cancel);
    document.removeEventListener("visibilitychange", onVisibility);
    dialog.inert = previous.inert; dialog.style.visibility = completed ? "hidden" : previous.visibility;
    if (previous.busy === null) dialog.removeAttribute("aria-busy"); else dialog.setAttribute("aria-busy", previous.busy);
    if (target && targetVisibility !== undefined) target.style.visibility = targetVisibility;
    if (completed && backdrop) backdrop.style.backgroundColor = "transparent";
    if (!completed && previous.focus instanceof HTMLElement && dialog.contains(previous.focus) && previous.focus.isConnected) previous.focus.focus({ preventScroll: true });
    motions.delete(dialog);
  };
  const onVisibility = () => { if (document.hidden) cancel(); };
  const degrade = () => {
    if (signal.aborted || degraded) return;
    degraded = true; waiting = false; window.clearTimeout(prepareTimer); stopTween?.(false); resolveReady();
    if (frame !== undefined) cancelAnimationFrame(frame);
    releaseRenderer(); stage.replaceChildren(); overlay.dataset.renderer = "fallback";
    dialog.style.visibility = previous.visibility;
    if (target && targetVisibility !== undefined) target.style.visibility = targetVisibility;
  };
  const tween = (duration: number, update: (progress: number) => void): Promise<void> => {
    if (signal.aborted || degraded) return Promise.resolve();
    return new Promise(resolve => {
      let settled = false;
      timeline = { start: performance.now(), duration, update }; update(0);
      const timer = window.setTimeout(() => finish(true), duration);
      function finish(atEnd = false) {
        if (settled) return;
        settled = true; window.clearTimeout(timer);
        if (atEnd && !signal.aborted && !degraded) update(1);
        timeline = undefined; stopTween = undefined; resolve();
      }
      stopTween = finish;
    });
  };
  const updateTrail = (now: number) => {
    const point: Point = [sourcePose.rect[0], sourcePose.rect[1]];
    history.unshift({ at: now, point });
    while (history.length > 64 || (history.length > 2 && history[history.length - 2]!.at < now - 450)) history.pop();
    for (let index = 0; index < 16; index++) {
      const at = now - index * 26;
      let older = history[history.length - 1]!;
      let newer = older;
      for (let cursor = 0; cursor < history.length - 1; cursor++) {
        if (history[cursor]!.at >= at && history[cursor + 1]!.at <= at) { newer = history[cursor]!; older = history[cursor + 1]!; break; }
      }
      const t = newer.at === older.at ? 1 : clamp((at - older.at) / (newer.at - older.at));
      trail[index * 2] = mix(older.point[0], newer.point[0], t); trail[index * 2 + 1] = mix(older.point[1], newer.point[1], t);
    }
  };
  const uniforms = (pose: Pose): NonNullable<VFXProps["uniforms"]> => ({
    screenSize: [window.innerWidth, window.innerHeight], pixelRatio,
    shapeRect: () => pose.rect, corner: () => pose.corner, textureMix: () => pose.textureMix, opacity: () => pose.opacity,
    trail: () => trail, trailOpacity: () => pose.trailOpacity, impact: () => pose.impact,
    inkColor: workRecordVfxColor("--brand", [49 / 255, 91 / 255, 73 / 255]),
    bounds: () => {
      let left = pose.rect[0] - pose.rect[2] / 2 - 55, top = pose.rect[1] - pose.rect[3] / 2 - 55;
      let right = pose.rect[0] + pose.rect[2] / 2 + 55, bottom = pose.rect[1] + pose.rect[3] / 2 + 55;
      if (pose.trailOpacity > 0) for (let index = 0; index < 16; index++) {
        left = Math.min(left, trail[index * 2]! - 20); right = Math.max(right, trail[index * 2]! + 20);
        top = Math.min(top, trail[index * 2 + 1]! - 20); bottom = Math.max(bottom, trail[index * 2 + 1]! + 20);
      }
      return [left, top, right, bottom];
    },
  });
  const draw = () => {
    if (signal.aborted || degraded) return;
    const now = performance.now();
    if (timeline) timeline.update(clamp((now - timeline.start) / timeline.duration));
    else if (waiting) {
      const elapsed = now - orbitStarted;
      const ramp = ease(clamp(elapsed / 240));
      const angle = elapsed / 1200 * Math.PI * 2;
      sourcePose.rect = [center[0] + Math.sin(angle) * orbitRadius * ramp, center[1] - Math.cos(angle) * orbitRadius * ramp, ORB_SIZE, ORB_SIZE];
    }
    updateTrail(now);
    try { renderer?.render(); } catch { degrade(); }
    if (!signal.aborted && !degraded) frame = requestAnimationFrame(draw);
  };
  const captureCard = async (card: HTMLElement, rect: DOMRect): Promise<boolean> => {
    const instance = renderer;
    if (!instance || degraded || signal.aborted) return false;
    const frozen = frozenSnapshot(card, rect); stage.append(frozen.slot); sources.push(frozen.snapshot);
    return new Promise(resolve => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return; settled = true; window.clearTimeout(timer); signal.removeEventListener("abort", abort); resolve(ok);
      };
      const abort = () => finish(false);
      const timer = window.setTimeout(() => finish(false), 200);
      signal.addEventListener("abort", abort, { once: true });
      void instance.add(frozen.snapshot, { shader: WORK_RECORD_SAVE_SHADER, overflow: true, uniforms: uniforms(cardPose), zIndex: 1 })
        .then(() => {
          if (settled || signal.aborted || degraded) { instance.remove(frozen.snapshot); return; }
          finish(true);
        }, () => finish(false)).catch(() => finish(false));
    });
  };
  const complete = async (recordId: string | undefined) => {
    if (signal.aborted || completing) return;
    completing = true;
    try {
      await ready;
      if (signal.aborted || !dialog.isConnected) return;
      target = await savedCard(recordId, signal);
      const track = target?.closest<HTMLElement>(".record-track");
      if (target && track) {
        const box = target.getBoundingClientRect(), view = track.getBoundingClientRect();
        const delta = box.left < view.left ? box.left - view.left : box.right > view.right ? box.right - view.right : 0;
        if (delta) track.scrollTo?.({ left: Math.max(0, track.scrollLeft + delta), behavior: "instant" });
      }
      await nextPaint(signal);
      if (signal.aborted || !dialog.isConnected) return;
      const to = target?.getBoundingClientRect();
      const hasTarget = !!to && to.width > 0 && to.height > 0 && to.bottom > 0 && to.top < window.innerHeight;
      const destination: Point = hasTarget ? [to.left + to.width / 2, to.top + to.height / 2] : center;
      let cardCaptured = false;
      if (hasTarget && target && to) cardCaptured = await captureCard(target, to);
      if (signal.aborted) return;
      if (hasTarget && target && !degraded) { targetVisibility = target.style.visibility; target.style.visibility = "hidden"; }
      if (backdrop?.animate) {
        const animation = backdrop.animate([{ backgroundColor: getComputedStyle(backdrop).backgroundColor }, { backgroundColor: "transparent" }], { duration: FLIGHT_MS, fill: "forwards" });
        animations.push(animation); void animation.finished.catch(() => undefined);
      }
      waiting = false; overlay.dataset.phase = "flying";
      const launch: Point = [sourcePose.rect[0], sourcePose.rect[1]];
      const bend: Point = [mix(launch[0], destination[0], .5), Math.min(launch[1], destination[1]) - Math.min(100, Math.abs(destination[0] - launch[0]) * .25)];
      await tween(FLIGHT_MS, value => {
        const t = value * value, rest = 1 - t;
        sourcePose.rect = [rest * rest * launch[0] + 2 * rest * t * bend[0] + t * t * destination[0], rest * rest * launch[1] + 2 * rest * t * bend[1] + t * t * destination[1], ORB_SIZE, ORB_SIZE];
        sourcePose.trailOpacity = 1; sourcePose.textureMix = 0;
      });
      if (signal.aborted) return;
      overlay.dataset.phase = "unfolding";
      if (hasTarget && target && !cardCaptured && !degraded) {
        target.style.visibility = targetVisibility ?? "";
        if (target.animate) {
          const animation = target.animate([{ opacity: 0, transform: "scale(.6)" }, { opacity: 1, transform: "scale(1.06)" }, { opacity: 1, transform: "scale(1)" }], { duration: UNFOLD_MS, easing: "ease-out", fill: "both" });
          animations.push(animation); void animation.finished.catch(() => undefined);
        }
      }
      await tween(UNFOLD_MS, value => {
        const spring = value === 1 ? 1 : 1 - Math.exp(-6 * value) * (Math.cos(10 * value) + .6 * Math.sin(10 * value));
        sourcePose.rect = [...destination, ORB_SIZE, ORB_SIZE];
        sourcePose.impact = hasTarget ? value : -1;
        sourcePose.opacity = 1 - ease(clamp(value * 2)); sourcePose.trailOpacity = 1 - ease(value);
        if (cardCaptured && to) {
          cardPose.rect = [...destination, mix(ORB_SIZE, to.width, spring), mix(ORB_SIZE, to.height, spring)];
          cardPose.corner = mix(20, 6, clamp(spring)); cardPose.opacity = 1; cardPose.textureMix = ease(value);
        }
      });
      if (!signal.aborted) {
        completed = true;
        if (target?.isConnected) target.focus({ preventScroll: true });
      }
    } catch {
      // A committed save still closes after a presentation failure.
      completed = !signal.aborted;
    } finally { cancel(); }
  };

  try {
    document.body.append(overlay); dialog.inert = true; dialog.setAttribute("aria-busy", "true");
    observer.observe(document.body, { childList: true, subtree: true });
    reduced?.addEventListener("change", cancel); window.addEventListener("pagehide", cancel, { once: true }); window.addEventListener("resize", cancel, { once: true });
    document.addEventListener("visibilitychange", onVisibility);
    motions.set(dialog, { complete, cancel });
    prepareTimer = window.setTimeout(degrade, PREPARE_MS);
    void (async () => {
      try {
        if (typeof OffscreenCanvas === "undefined") { degrade(); return; }
        const { VFX } = await loadWorkRecordVfx();
        if (signal.aborted || degraded) return;
        const instance = new VFX({ autoplay: false, scrollPadding: false, pixelRatio, wrapper: stage, zIndex: 1 });
        renderer = instance; canvas = stage.querySelector("canvas") ?? undefined;
        canvas?.addEventListener("webglcontextlost", degrade, { once: true });
        const frozen = frozenSnapshot(dialog, from); stage.append(frozen.slot); sources.push(frozen.snapshot);
        await instance.add(frozen.snapshot, { shader: WORK_RECORD_SAVE_SHADER, overflow: true, uniforms: uniforms(sourcePose) });
        if (signal.aborted || degraded) { instance.remove(frozen.snapshot); return; }
        window.clearTimeout(prepareTimer); overlay.dataset.renderer = "canvas"; overlay.dataset.phase = "condensing"; dialog.style.visibility = "hidden";
        const start = [...sourcePose.rect] as Pose["rect"];
        const entrance = tween(CONDENSE_MS, value => {
          const t = ease(value);
          sourcePose.rect = [mix(start[0], center[0], t), mix(start[1], center[1], t), mix(start[2], ORB_SIZE, t), mix(start[3], ORB_SIZE, t)];
          sourcePose.corner = mix(12, 20, t); sourcePose.textureMix = 1 - ease(clamp((value - .45) / .55)); sourcePose.trailOpacity = ease(clamp((value - .4) / .6));
        });
        draw(); await entrance;
        if (!signal.aborted && !degraded) { waiting = true; orbitStarted = performance.now(); overlay.dataset.phase = "waiting"; }
        resolveReady();
      } catch { degrade(); }
    })();
  } catch { cancel(); }
}

export async function absorbWorkRecordDialog(dialog: HTMLElement | null, recordId: string | undefined): Promise<void> {
  if (dialog) await motions.get(dialog)?.complete(recordId);
}

export function cancelWorkRecordSaveMotion(dialog: HTMLElement | null): void {
  if (dialog) motions.get(dialog)?.cancel();
}
