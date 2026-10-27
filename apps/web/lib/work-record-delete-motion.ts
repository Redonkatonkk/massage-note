import type { VFX } from "@vfx-js/core";
import { WORK_RECORD_BURN_SHADER } from "./work-record-burn-shader";
import { disposeWorkRecordVfx, loadWorkRecordVfx, preloadWorkRecordVfx, workRecordVfxColor } from "./work-record-vfx";

const BURN_MS = 500;
const PREPARE_MS = 250;
/** Fetch the renderer while an existing card's deletion controls are open. */
export function preloadWorkRecordDeleteMotion(): void {
  preloadWorkRecordVfx();
}

interface DeleteMotion {
  finished: Promise<void>;
  cancel: () => void;
}

/** Start only after DELETE succeeds. The frozen card survives an early refresh. */
export function beginWorkRecordDeleteMotion(recordId: string): DeleteMotion {
  const skipped = { finished: Promise.resolve(), cancel: () => {} };
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (reduced?.matches) return skipped;
  const card = [...document.querySelectorAll<HTMLElement>(".record-track [data-work-record-id]")]
    .find(candidate => candidate.dataset.workRecordId === recordId);
  if (!card) return skipped;
  const rect = card.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return skipped;

  const overlay = document.createElement("div");
  const snapshot = card.cloneNode(true) as HTMLElement;
  const track = card.closest(".record-track")!;
  const previousVisibility = card.style.visibility;
  let phase: "preparing" | "burning" | "fallback" | "ended" = "preparing";
  let renderer: VFX | undefined;
  let canvas: HTMLCanvasElement | undefined;
  let fade: Animation | undefined;
  let timer: number | undefined;
  let frame: number | undefined;
  let observer: MutationObserver | undefined;
  let released = false;
  let progress = 0;
  let resolveFinished!: () => void;
  const finished = new Promise<void>(resolve => { resolveFinished = resolve; });

  const disposeRenderer = () => {
    const instance = renderer;
    renderer = undefined;
    disposeWorkRecordVfx(instance, [snapshot], canvas);
    canvas = undefined;
  };
  const finish = () => {
    if (phase === "ended") return;
    phase = "ended";
    window.clearTimeout(timer);
    if (frame !== undefined) cancelAnimationFrame(frame);
    disposeRenderer();
    fade?.cancel();
    overlay.remove();
    observer?.disconnect();
    reduced?.removeEventListener("change", cancel);
    window.removeEventListener("pagehide", cancel);
    window.removeEventListener("resize", cancel);
    document.removeEventListener("scroll", onScroll, true);
    document.removeEventListener("visibilitychange", onVisibility);
    resolveFinished();
  };
  const cancel = () => {
    if (released) return;
    released = true;
    finish();
    card.style.visibility = previousVisibility;
  };
  const onScroll = (event: Event) => {
    // Realtime refresh may auto-scroll a track; it must not cut the burn short.
    if (!(event.target instanceof Element && event.target.closest(".record-track"))) cancel();
  };
  const onVisibility = () => { if (document.hidden) cancel(); };
  const fallback = () => {
    if (phase === "ended" || phase === "fallback") return;
    phase = "fallback";
    window.clearTimeout(timer);
    disposeRenderer();
    snapshot.style.opacity = "1";
    try {
      if (!snapshot.animate) { finish(); return; }
      fade = snapshot.animate([{ opacity: 1 }, { opacity: 0 }], { duration: BURN_MS, easing: "ease-out", fill: "forwards" });
      void fade.finished.then(finish, finish);
      timer = window.setTimeout(finish, BURN_MS + 50);
    } catch { finish(); }
  };

  try {
    overlay.className = "work-record-delete-motion";
    overlay.setAttribute("aria-hidden", "true");
    overlay.inert = true;
    const slot = document.createElement("div");
    slot.className = "work-record-delete-motion__card";
    Object.assign(slot.style, { left: rect.left + "px", top: rect.top + "px", width: rect.width + "px", height: rect.height + "px" });
    snapshot.removeAttribute("data-work-record-id");
    for (const node of [snapshot, ...snapshot.querySelectorAll("[id]")]) node.removeAttribute("id");
    snapshot.tabIndex = -1;
    Object.assign(snapshot.style, {
      width: "100%", minWidth: "0", maxWidth: "none", height: "100%", minHeight: "0", maxHeight: "none",
      margin: "0", visibility: "visible", transform: "none", transition: "none", animation: "none",
    });
    slot.append(snapshot); overlay.append(slot); document.body.append(overlay);
    card.style.visibility = "hidden";
    observer = new MutationObserver(() => { if (!track.isConnected) cancel(); });
    observer.observe(document.body, { childList: true, subtree: true });
    reduced?.addEventListener("change", cancel);
    window.addEventListener("pagehide", cancel, { once: true });
    window.addEventListener("resize", cancel, { once: true });
    document.addEventListener("scroll", onScroll, { capture: true, passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    timer = window.setTimeout(fallback, PREPARE_MS);

    void (async () => {
      try {
        if (typeof OffscreenCanvas === "undefined") { fallback(); return; }
        const { VFX } = await loadWorkRecordVfx();
        if (phase !== "preparing") return;
        const instance = new VFX({ autoplay: false, scrollPadding: false, pixelRatio: Math.min(window.devicePixelRatio || 1, 2), wrapper: overlay, zIndex: 1 });
        renderer = instance;
        canvas = overlay.querySelector("canvas") ?? undefined;
        canvas?.addEventListener("webglcontextlost", fallback, { once: true });
        await instance.add(snapshot, {
          shader: WORK_RECORD_BURN_SHADER,
          uniforms: {
            progress: () => progress,
            seed: Math.random() * 100,
            burnColor: workRecordVfxColor("--work-record-burn-ember", [1, .5, 0]),
            hotColor: workRecordVfxColor("--work-record-burn-glow", [1, .89, .63]),
          },
        });
        if (phase !== "preparing") { instance.remove(snapshot); return; }
        phase = "burning";
        window.clearTimeout(timer);
        const started = performance.now();
        const draw = () => {
          if (phase !== "burning") return;
          try {
            progress = Math.min(1, (performance.now() - started) / BURN_MS);
            instance.render();
            frame = requestAnimationFrame(draw);
          } catch { fallback(); }
        };
        draw();
        if (phase === "burning") timer = window.setTimeout(() => {
          progress = 1;
          try { instance.render(); } catch { /* Still finish a committed deletion. */ }
          finish();
        }, BURN_MS);
      } catch {
        fallback();
      }
    })();
  } catch { cancel(); }
  return { finished, cancel };
}
