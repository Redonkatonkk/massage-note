import type { VFX } from "@vfx-js/core";

let modulePromise: Promise<typeof import("@vfx-js/core")> | undefined;

export function loadWorkRecordVfx() {
  return modulePromise ??= import("@vfx-js/core").catch(error => { modulePromise = undefined; throw error; });
}

export function preloadWorkRecordVfx(): void {
  void loadWorkRecordVfx().catch(() => undefined);
}

export function workRecordVfxColor(token: string, fallback: [number, number, number]): [number, number, number] {
  const hex = getComputedStyle(document.documentElement).getPropertyValue(token).trim().match(/^#([\da-f]{6})$/i)?.[1];
  return hex ? [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16) / 255) as [number, number, number] : fallback;
}

/** VFX-JS restores DOM opacity on removal; release the context after its resources. */
export function disposeWorkRecordVfx(renderer: VFX | undefined, sources: readonly HTMLElement[], canvas: HTMLCanvasElement | undefined): void {
  for (const source of sources) {
    try { renderer?.remove(source); } catch { /* Continue cleanup after presentation failures. */ }
  }
  try { renderer?.destroy(); } catch { /* Still remove owned DOM and GPU context. */ }
  try { canvas?.getContext("webgl2")?.getExtension("WEBGL_lose_context")?.loseContext(); } catch { /* Already lost. */ }
  canvas?.remove();
}
