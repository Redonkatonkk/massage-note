import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { followRecordTrackEnd } from "./record-track-scroll";

class Track extends EventTarget {
  scrollWidth = 1200;
  clientWidth = 400;
  scrollLeft = 0;
  children = [];
  scrollTo = vi.fn(({ left }: ScrollToOptions) => {
    this.scrollLeft = Math.min(left ?? 0, this.scrollWidth - this.clientWidth);
  });
}

describe("open-day record track", () => {
  let track: Track;
  let surface: EventTarget;
  let resize: () => void;
  let cleanup: () => void;
  const scrollBack = () => {
    track.scrollLeft = 100;
    track.dispatchEvent(new Event("scroll"));
  };
  const pointer = (target: EventTarget, type: string) => {
    target.dispatchEvent(Object.assign(new Event(type), { pointerId: 1 }));
  };
  beforeEach(() => {
    vi.useFakeTimers();
    surface = new EventTarget();
    vi.stubGlobal("window", Object.assign(surface, { matchMedia: () => ({ matches: false }) }));
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe() {}
      disconnect() {}
    });
    vi.stubGlobal("MutationObserver", class { observe() {} disconnect() {} });
    track = new Track();
    cleanup = followRecordTrackEnd(track as unknown as HTMLDivElement);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it("opens at the end, allows browsing, and returns after ten idle seconds", () => {
    expect(track.scrollLeft).toBe(800);
    scrollBack();
    vi.advanceTimersByTime(9999);
    expect(track.scrollLeft).toBe(100);
    vi.advanceTimersByTime(1);
    expect(track.scrollLeft).toBe(800);
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 1200, behavior: "smooth" });
  });
  it("restarts the interval after further scrolling or wheel input", () => {
    scrollBack();
    vi.advanceTimersByTime(9000);
    track.dispatchEvent(new Event("wheel"));
    vi.advanceTimersByTime(9000);
    expect(track.scrollLeft).toBe(100);
    vi.advanceTimersByTime(1000);
    expect(track.scrollLeft).toBe(800);
  });
  it("does not return while a pointer is held, including touch scrolling", () => {
    pointer(track, "pointerdown");
    scrollBack();
    vi.advanceTimersByTime(20000);
    expect(track.scrollLeft).toBe(100);
    pointer(surface, "pointercancel");
    vi.advanceTimersByTime(10000);
    expect(track.scrollLeft).toBe(800);
  });
  it("follows new content at the end without interrupting a reading interval", () => {
    track.scrollWidth = 1500;
    resize();
    expect(track.scrollLeft).toBe(1100);
    scrollBack();
    track.scrollWidth = 1800;
    resize();
    expect(track.scrollLeft).toBe(100);
    vi.advanceTimersByTime(10000);
    expect(track.scrollLeft).toBe(1400);
  });
  it("cancels pending returns and listeners on closing or unmount", () => {
    scrollBack();
    cleanup();
    vi.advanceTimersByTime(10000);
    track.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(10000);
    expect(track.scrollLeft).toBe(100);
  });
  it("respects reduced motion", () => {
    vi.stubGlobal("window", Object.assign(surface, { matchMedia: () => ({ matches: true }) }));
    scrollBack();
    vi.advanceTimersByTime(10000);
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 1200, behavior: "instant" });
  });
});
