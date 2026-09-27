import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { followRecordTrackEnd } from "./record-track-scroll";

class Track extends EventTarget {
  scrollWidth = 1200;
  clientWidth = 400;
  scrollLeft = 0;
  children = [];
  anchor: { getBoundingClientRect: () => { right: number } } | null = null;
  getBoundingClientRect() { return { left: 0, right: this.clientWidth }; }
  querySelector(selector: string) { return selector === ".add-record" ? this.anchor : null; }
  scrollTo = vi.fn(({ left }: ScrollToOptions) => {
    this.scrollLeft = Math.min(left ?? 0, this.scrollWidth - this.clientWidth);
  });
}

describe("open-day record track", () => {
  let track: Track;
  let surface: EventTarget;
  let resize: () => void;
  let mutate: () => void;
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
    vi.stubGlobal("MutationObserver", class {
      constructor(callback: () => void) { mutate = callback; }
      observe() {}
      disconnect() {}
    });
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
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 800, behavior: "smooth" });
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
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 800, behavior: "instant" });
  });
  it("aligns the add-record card 16px from the right edge and permits browsing both directions", () => {
    // Its right edge is at content coordinate 700, so scrollLeft 316 leaves 16px.
    track.anchor = { getBoundingClientRect: () => ({ right: 700 - track.scrollLeft }) };
    cleanup();
    cleanup = followRecordTrackEnd(track as unknown as HTMLDivElement);
    expect(track.scrollLeft).toBe(316);

    track.scrollLeft = 100;
    track.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(5000);
    track.scrollLeft = 500;
    track.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(9999);
    expect(track.scrollLeft).toBe(500);
    vi.advanceTimersByTime(1);
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 316, behavior: "smooth" });
  });
  it("updates the followed anchor after reorder or highlight changes when dimensions stay the same", () => {
    track.anchor = { getBoundingClientRect: () => ({ right: 700 - track.scrollLeft }) };
    cleanup();
    cleanup = followRecordTrackEnd(track as unknown as HTMLDivElement);
    track.anchor = { getBoundingClientRect: () => ({ right: 1000 - track.scrollLeft }) };
    mutate();
    expect(track.scrollLeft).toBe(616);

    // A content change during a reading interval updates the future destination
    // but leaves the user's current position and ten-second deadline intact.
    track.scrollLeft = 100;
    track.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(5000);
    track.anchor = { getBoundingClientRect: () => ({ right: 900 - track.scrollLeft }) };
    mutate();
    expect(track.scrollLeft).toBe(100);
    vi.advanceTimersByTime(4999);
    expect(track.scrollLeft).toBe(100);
    vi.advanceTimersByTime(1);
    expect(track.scrollLeft).toBe(516);
  });
  it("keeps the reading interval through resize and falls back to the end without an add-record card", () => {
    scrollBack();
    vi.advanceTimersByTime(4000);
    track.clientWidth = 500;
    resize();
    expect(track.scrollLeft).toBe(100);
    vi.advanceTimersByTime(6000);
    expect(track.scrollLeft).toBe(700);

    track.scrollLeft = 0;
    track.anchor = null;
    mutate();
    expect(track.scrollLeft).toBe(700);
    const callsAtEnd = track.scrollTo.mock.calls.length;
    track.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(10000);
    expect(track.scrollTo).toHaveBeenCalledTimes(callsAtEnd);
  });
});
