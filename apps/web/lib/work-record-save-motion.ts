import type { VFX, VFXProps } from "@vfx-js/core";
import { translateText } from "./i18n";
import { SAVE_HEAD_RADIUS, SAVE_TRAIL_POINTS, WORK_RECORD_SAVE_SHADER } from "./work-record-save-shader";
import { disposeWorkRecordVfx, loadWorkRecordVfx, preloadWorkRecordVfx, workRecordVfxColor } from "./work-record-vfx";

const CONDENSE_MS = 260;
const FLIGHT_MS = 420;
const EXPAND_MS = 155;
const HANDOFF_MS = 100;
const PREPARE_MS = 400;
const ORB_SIZE = 40;
const TRAIL_DURATION_MS = 320;

export interface SaveMotion {
  complete: (recordId: string | undefined) => Promise<void>;
  cancel: () => void;
  prepareTarget?: (recordId: string) => void;
  setWaitingVisible?: (visible: boolean) => void;
}
interface Pose {
  rect: [number, number, number, number];
  corner: number;
  textureMix: number;
  opacity: number;
  trailOpacity: number;
  expansion: number;
}
type Point = [number, number];
const motions = new WeakMap<HTMLElement, SaveMotion>();
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => 1 - (1 - value) ** 3;
const easeInOut = (value: number) => value * value * (3 - 2 * value);
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
export function beginWorkRecordSaveMotion(dialog: HTMLElement | null, detached = false): SaveMotion | undefined {
  if (!dialog) return;
  if (!detached) cancelWorkRecordSaveMotion(dialog);
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (!dialog.isConnected || reduced?.matches) return;
  const from = dialog.getBoundingClientRect();
  if (from.width <= 0 || from.height <= 0) return;
  // Capture geometry and values synchronously; the caller may unmount the live dialog now.
  const initialSnapshot = detached ? frozenSnapshot(dialog, from) : undefined;
  const controller = new AbortController();
  const { signal } = controller;
  const previous = {
    inert: dialog.inert, visibility: dialog.style.visibility, opacity: dialog.style.opacity,
    opacityPriority: dialog.style.getPropertyPriority("opacity"), busy: dialog.getAttribute("aria-busy"), focus: document.activeElement,
  };
  // A child's explicit visibility can escape a hidden parent (the mode capsule does this).
  // Opacity composites the whole subtree; important also overrides dialog entrance keyframes.
  const hideDialog = () => { dialog.style.visibility = "hidden"; dialog.style.setProperty("opacity", "0", "important"); };
  const restoreDialog = () => { dialog.style.visibility = previous.visibility; dialog.style.setProperty("opacity", previous.opacity, previous.opacityPriority); };
  const overlay = document.createElement("div");
  overlay.className = "work-record-save-motion"; overlay.setAttribute("role", "status"); overlay.dataset.renderer = "pending";
  const stage = document.createElement("div"); stage.className = "work-record-save-motion__stage"; stage.setAttribute("aria-hidden", "true"); stage.inert = true;
  const status = document.createElement("span"); status.className = "work-record-save-motion__status";
  status.textContent = translateText("正在保存记工…", document.documentElement.lang === "en-US" ? "en-US" : "zh-CN");
  const fallback = document.createElement("div"); fallback.className = "work-record-save-motion__fallback"; fallback.setAttribute("aria-hidden", "true");
  overlay.append(stage, fallback, status);
  overlay.dataset.waitingVisible = "true";
  if (detached) overlay.setAttribute("aria-hidden", "true");
  const center: Point = [window.innerWidth / 2, window.innerHeight / 2];
  const orbitRadius = Math.min(100, Math.max(60, window.innerWidth * .18), window.innerHeight * .2);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const sourcePose: Pose = { rect: [from.left + from.width / 2, from.top + from.height / 2, from.width, from.height], corner: 12, textureMix: 1, opacity: 1, trailOpacity: 0, expansion: -1 };
  const lightColor = workRecordVfxColor("--brand-soft", [229 / 255, 241 / 255, 243 / 255]);
  let cardColor = lightColor;
  const sources: HTMLElement[] = [];
  const trail = new Float32Array(SAVE_TRAIL_POINTS * 2);
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
  let heldTarget: { element: HTMLElement; opacity: string; priority: string } | undefined;
  let preparedId: string | undefined;
  let targetObserver: MutationObserver | undefined;
  let stopTween: ((atEnd?: boolean) => void) | undefined;
  let timeline: { start: number; duration: number; update: (progress: number) => void } | undefined;
  let resolveReady!: () => void;
  const ready = new Promise<void>(resolve => { resolveReady = resolve; });
  const animations: Animation[] = [];
  const backdrop = dialog.closest<HTMLElement>(".modal-backdrop");
  const observer = new MutationObserver(() => { if (!detached && !dialog.isConnected) cancel(); });

  const releaseRenderer = () => {
    const instance = renderer; renderer = undefined;
    disposeWorkRecordVfx(instance, sources, canvas); canvas = undefined;
  };
  const restoreTarget = () => {
    if (heldTarget) {
      heldTarget.element.style.setProperty("opacity", heldTarget.opacity, heldTarget.priority);
      heldTarget = undefined;
    }
  };
  const holdTarget = (element: HTMLElement) => {
    // Opacity leaves the real buttons in hit testing during the decoration.
    heldTarget = { element, opacity: element.style.opacity, priority: element.style.getPropertyPriority("opacity") };
    element.style.setProperty("opacity", "0", "important");
  };
  const cancel = () => {
    if (signal.aborted) return;
    controller.abort(); window.clearTimeout(prepareTimer); stopTween?.(false); resolveReady();
    if (frame !== undefined) cancelAnimationFrame(frame);
    releaseRenderer(); for (const animation of animations) animation.cancel();
    observer.disconnect(); targetObserver?.disconnect(); overlay.remove();
    reduced?.removeEventListener("change", cancel); window.removeEventListener("pagehide", cancel); window.removeEventListener("resize", cancel);
    document.removeEventListener("visibilitychange", onVisibility);
    document.removeEventListener("scroll", onScroll, true);
    document.removeEventListener("pointerdown", onInteraction);
    document.removeEventListener("keydown", onInteraction);
    restoreTarget();
    if (!detached) {
      dialog.inert = previous.inert;
      if (completed) hideDialog(); else restoreDialog();
      if (previous.busy === null) dialog.removeAttribute("aria-busy"); else dialog.setAttribute("aria-busy", previous.busy);
      if (completed && backdrop) backdrop.style.backgroundColor = "transparent";
      if (!completed && previous.focus instanceof HTMLElement && dialog.contains(previous.focus) && previous.focus.isConnected) previous.focus.focus({ preventScroll: true });
      motions.delete(dialog);
    }
  };
  const onVisibility = () => { if (document.hidden) cancel(); };
  const onInteraction = () => { if (completing || heldTarget) cancel(); };
  const onScroll = () => {
    if (overlay.dataset.phase === "flying" || overlay.dataset.phase === "unfolding") cancel();
  };
  const prepareTarget = (recordId: string) => {
    if (signal.aborted || degraded || preparedId) return;
    // If another read already painted the card, leave it visible.
    if (recordCard(recordId)) { cancel(); return; }
    preparedId = recordId;
    targetObserver = new MutationObserver(() => {
      const card = recordCard(recordId);
      if (card) { holdTarget(card); targetObserver?.disconnect(); }
    });
    // Observe before requesting the board. Mutation callbacks run before its first paint.
    targetObserver.observe(document.body, { childList: true, subtree: true });
  };
  const degrade = () => {
    if (signal.aborted || degraded) return;
    degraded = true; waiting = false; window.clearTimeout(prepareTimer); stopTween?.(false); resolveReady();
    if (frame !== undefined) cancelAnimationFrame(frame);
    targetObserver?.disconnect(); releaseRenderer(); stage.replaceChildren(); overlay.dataset.renderer = "fallback";
    if (!detached) restoreDialog();
    restoreTarget();
  };
  const tween = (duration: number, update: (progress: number) => void): Promise<void> => {
    if (signal.aborted || degraded) return Promise.resolve();
    return new Promise(resolve => {
      let settled = false;
      timeline = { start: performance.now(), duration, update };
      const timer = window.setTimeout(() => finish(true), duration);
      function finish(atEnd = false) {
        if (settled) return;
        settled = true; window.clearTimeout(timer);
        if (atEnd && !signal.aborted && !degraded) update(1);
        timeline = undefined; stopTween = undefined; resolve();
      }
      stopTween = finish;
      update(0);
    });
  };
  const updateTrail = (now: number) => {
    const point: Point = [sourcePose.rect[0], sourcePose.rect[1]];
    history.unshift({ at: now, point });
    while (history.length > 64 || (history.length > 2 && history[history.length - 2]!.at < now - TRAIL_DURATION_MS)) history.pop();
    for (let index = 0; index < SAVE_TRAIL_POINTS; index++) {
      const at = now - index * TRAIL_DURATION_MS / (SAVE_TRAIL_POINTS - 1);
      let older = history[history.length - 1]!;
      let newer = older;
      for (let cursor = 0; cursor < history.length - 1; cursor++) {
        if (history[cursor]!.at >= at && history[cursor + 1]!.at <= at) { newer = history[cursor]!; older = history[cursor + 1]!; break; }
      }
      const t = newer.at === older.at ? 1 : clamp((at - older.at) / (newer.at - older.at));
      trail[index * 2] = mix(older.point[0], newer.point[0], t); trail[index * 2 + 1] = mix(older.point[1], newer.point[1], t);
    }
  };
  const uniforms: NonNullable<VFXProps["uniforms"]> = {
    screenSize: [window.innerWidth, window.innerHeight], pixelRatio, uncovered: detached ? 1 : 0,
    shapeRect: () => sourcePose.rect, corner: () => sourcePose.corner, textureMix: () => sourcePose.textureMix, opacity: () => sourcePose.opacity,
    trail: () => trail, trailOpacity: () => sourcePose.trailOpacity, expansion: () => sourcePose.expansion,
    inkColor: workRecordVfxColor("--brand", [27 / 255, 108 / 255, 128 / 255]),
    lightColor, cardColor: () => cardColor,
    bounds: () => {
      const [x, y, width, height] = sourcePose.rect;
      let left = x - width / 2 - 1, top = y - height / 2 - 1;
      let right = x + width / 2 + 1, bottom = y + height / 2 + 1;
      const padding = SAVE_HEAD_RADIUS + 1;
      if (sourcePose.trailOpacity > 0) for (let index = 0; index < SAVE_TRAIL_POINTS; index++) {
        left = Math.min(left, trail[index * 2]! - padding); right = Math.max(right, trail[index * 2]! + padding);
        top = Math.min(top, trail[index * 2 + 1]! - padding); bottom = Math.max(bottom, trail[index * 2 + 1]! + padding);
      }
      return [left, top, right, bottom];
    },
  };
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
    if (!waiting || overlay.dataset.waitingVisible === "true") {
      try { renderer?.render(); } catch { degrade(); }
    }
    if (!signal.aborted && !degraded) frame = requestAnimationFrame(draw);
  };
  const complete = async (recordId: string | undefined) => {
    if (signal.aborted || completing) return;
    completing = true;
    try {
      await ready;
      if (signal.aborted || (!detached && !dialog.isConnected)) return;
      target = await savedCard(recordId, signal);
      const track = target?.closest<HTMLElement>(".record-track");
      if (!detached && target && track) {
        const box = target.getBoundingClientRect(), view = track.getBoundingClientRect();
        const delta = box.left < view.left ? box.left - view.left : box.right > view.right ? box.right - view.right : 0;
        if (delta) track.scrollTo?.({ left: Math.max(0, track.scrollLeft + delta), behavior: "instant" });
      }
      await nextPaint(signal);
      if (signal.aborted || (!detached && !dialog.isConnected)) return;
      targetObserver?.disconnect();
      const to = target?.getBoundingClientRect();
      const trackBox = track?.getBoundingClientRect();
      const hasTarget = !degraded && target?.isConnected && !!to &&
        (!preparedId || (preparedId === recordId && heldTarget?.element === target)) &&
        to.width > 0 && to.height > 0 && to.bottom > 0 && to.top < window.innerHeight &&
        (!detached || (!document.querySelector('.modal-backdrop, dialog[open]') && to.left >= 0 && to.right <= window.innerWidth &&
          (!trackBox || (to.left >= trackBox.left && to.right <= trackBox.right))));
      const box = hasTarget ? to : undefined;
      const destination: Point = box ? [box.left + box.width / 2, box.top + box.height / 2] : center;
      let corner = SAVE_HEAD_RADIUS;
      if (box && target) {
        const style = getComputedStyle(target);
        corner = parseFloat(style.borderTopLeftRadius) || 0;
        const rgb = style.backgroundColor.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (rgb) cardColor = [Number(rgb[1]) / 255, Number(rgb[2]) / 255, Number(rgb[3]) / 255];
        if (!heldTarget) holdTarget(target);
      } else restoreTarget();
      if (!detached && backdrop?.animate) {
        const animation = backdrop.animate([{ backgroundColor: getComputedStyle(backdrop).backgroundColor }, { backgroundColor: "transparent" }], { duration: FLIGHT_MS, fill: "forwards" });
        animations.push(animation); void animation.finished.catch(() => undefined);
      }
      waiting = false; overlay.dataset.phase = "flying";
      const launch: Point = [sourcePose.rect[0], sourcePose.rect[1]];
      const bend: Point = [mix(launch[0], destination[0], .5), Math.min(launch[1], destination[1]) - Math.min(100, Math.abs(destination[0] - launch[0]) * .25)];
      const duration = FLIGHT_MS + (box ? EXPAND_MS : 0) + HANDOFF_MS;
      await tween(duration, value => {
        const elapsed = value * duration;
        if (box && !target?.isConnected) { cancel(); return; }
        if (elapsed < FLIGHT_MS) {
          const t = easeInOut(elapsed / FLIGHT_MS), rest = 1 - t;
          sourcePose.rect = [rest * rest * launch[0] + 2 * rest * t * bend[0] + t * t * destination[0], rest * rest * launch[1] + 2 * rest * t * bend[1] + t * t * destination[1], ORB_SIZE, ORB_SIZE];
          sourcePose.trailOpacity = 1; sourcePose.textureMix = 0;
          return;
        }
        if (overlay.dataset.phase !== "unfolding") overlay.dataset.phase = "unfolding";
        const arrival = elapsed - FLIGHT_MS;
        sourcePose.trailOpacity = 1 - ease(clamp(arrival / HANDOFF_MS));
        if (box) {
          const expansion = easeInOut(clamp(arrival / EXPAND_MS));
          const diameter = SAVE_HEAD_RADIUS * 2;
          sourcePose.rect = [...destination, mix(diameter, box.width, expansion), mix(diameter, box.height, expansion)];
          sourcePose.corner = mix(SAVE_HEAD_RADIUS, corner, expansion);
          sourcePose.expansion = expansion;
          // The live card appears underneath the fully expanded surface and takes over as it fades.
          if (arrival >= EXPAND_MS) restoreTarget();
          sourcePose.opacity = 1 - ease(clamp((arrival - EXPAND_MS) / HANDOFF_MS));
        } else {
          sourcePose.rect = [...destination, ORB_SIZE, ORB_SIZE];
          sourcePose.opacity = 1 - ease(clamp(arrival / HANDOFF_MS));
        }
      });
      if (!signal.aborted) {
        completed = true;
        if (!detached && target?.isConnected) target.focus({ preventScroll: true });
      }
    } catch {
      // A committed save still closes after a presentation failure.
      completed = !signal.aborted;
    } finally { cancel(); }
  };

  try {
    document.body.append(overlay);
    if (!detached) {
      dialog.inert = true; dialog.setAttribute("aria-busy", "true");
      observer.observe(document.body, { childList: true, subtree: true });
    }
    reduced?.addEventListener("change", cancel); window.addEventListener("pagehide", cancel, { once: true }); window.addEventListener("resize", cancel, { once: true });
    document.addEventListener("visibilitychange", onVisibility);
    if (detached) {
      document.addEventListener("scroll", onScroll, true);
      document.addEventListener("pointerdown", onInteraction);
      document.addEventListener("keydown", onInteraction);
    }
    const handle: SaveMotion = { complete, cancel, prepareTarget, setWaitingVisible: visible => { overlay.dataset.waitingVisible = String(visible); } };
    if (!detached) motions.set(dialog, handle);
    prepareTimer = window.setTimeout(degrade, PREPARE_MS);
    void (async () => {
      try {
        if (typeof OffscreenCanvas === "undefined") { degrade(); return; }
        const { VFX } = await loadWorkRecordVfx();
        if (signal.aborted || degraded) return;
        const instance = new VFX({ autoplay: false, scrollPadding: false, pixelRatio, wrapper: stage, zIndex: 1 });
        renderer = instance; canvas = stage.querySelector("canvas") ?? undefined;
        canvas?.addEventListener("webglcontextlost", degrade, { once: true });
        const frozen = initialSnapshot ?? frozenSnapshot(dialog, from); stage.append(frozen.slot); sources.push(frozen.snapshot);
        await instance.add(frozen.snapshot, { shader: WORK_RECORD_SAVE_SHADER, overflow: true, uniforms });
        if (signal.aborted || degraded) { instance.remove(frozen.snapshot); return; }
        window.clearTimeout(prepareTimer); overlay.dataset.renderer = "canvas"; overlay.dataset.phase = "condensing"; if (!detached) hideDialog();
        const start = [...sourcePose.rect] as Pose["rect"];
        const entrance = tween(CONDENSE_MS, value => {
          const t = ease(value);
          sourcePose.rect = [mix(start[0], center[0], t), mix(start[1], center[1], t), mix(start[2], ORB_SIZE, t), mix(start[3], ORB_SIZE, t)];
          sourcePose.corner = mix(12, 20, t); sourcePose.textureMix = 1 - ease(clamp((value - .45) / .55));
          sourcePose.trailOpacity = 0;
        });
        draw(); await entrance;
        if (!signal.aborted && !degraded) {
          // The side editor can travel hundreds of pixels horizontally while condensing.
          // Seed the trail at the center so the straight approach never enters the orbit.
          history.length = 0; orbitStarted = performance.now(); updateTrail(orbitStarted);
          sourcePose.trailOpacity = 1; waiting = true; overlay.dataset.phase = "waiting";
        }
        resolveReady();
      } catch { degrade(); }
    })();
    return handle;
  } catch { cancel(); return undefined; }
}

export async function absorbWorkRecordDialog(dialog: HTMLElement | null, recordId: string | undefined): Promise<void> {
  if (dialog) await motions.get(dialog)?.complete(recordId);
}

export function cancelWorkRecordSaveMotion(dialog: HTMLElement | null): void {
  if (dialog) motions.get(dialog)?.cancel();
}

/** Page tasks own this handle; removing the submitted form does not cancel it. */
export function beginDetachedWorkRecordSaveMotion(dialog: HTMLElement | null): SaveMotion | undefined {
  try { return beginWorkRecordSaveMotion(dialog, true); } catch { return undefined; }
}
