import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { followRecordTrackEnd } from "./record-track-scroll";

class Track extends EventTarget {
  private fixedScrollWidth = 1200;
  clientWidth = 400;
  scrollLeft = 0;
  children: Array<{ width?: number; highlighted?: boolean; excluded?: boolean; getBoundingClientRect?: () => { right: number; width: number } }> = [];
  dataset: Record<string, string | undefined> = {};
  anchor: { getBoundingClientRect: () => { right: number; width?: number } } | null = null;
  tail: { style: { width: number; setProperty: (name: string, value: string) => void }; getBoundingClientRect: () => { right: number; width: number } } | null = null;
  get scrollWidth() {
    if (!this.anchor || !this.tail) return this.fixedScrollWidth;
    const cards = this.children.filter((child) => child !== this.tail);
    const width = 16 + cards.length * 177 + Math.max(0, cards.length - 1) * 12 + 16
      + (this.dataset.returnTail === "true" ? 12 + this.tail.style.width : 0);
    return Math.max(this.clientWidth, width);
  }
  set scrollWidth(value: number) { this.fixedScrollWidth = value; }
  getBoundingClientRect() { return { left: 0, right: this.clientWidth }; }
  querySelector(selector: string) {
    if (selector === ".add-record") return this.anchor;
    if (selector === ".record-track-tail") return this.tail;
    return null;
  }
  querySelectorAll(selector: string) {
    return selector === ".record-card--right-group" ? this.children.filter((child) => child.highlighted || child.excluded) : [];
  }
  removeAttribute(name: string) { if (name === "data-return-tail") delete this.dataset.returnTail; }
  scrollTo = vi.fn(({ left }: ScrollToOptions) => {
    this.scrollLeft = Math.min(left ?? 0, this.scrollWidth - this.clientWidth);
  });

  useLayout(highlightedCount: number, ordinaryCount = 5, excludedCount = 0) {
    const card = (highlighted: boolean, excluded = false) => ({
      width: 177,
      highlighted,
      excluded,
      getBoundingClientRect: () => ({ right: 0, width: 177 }),
    });
    const ordinary = Array.from({ length: ordinaryCount }, () => card(false));
    const highlights = Array.from({ length: highlightedCount }, () => card(true));
    const excluded = Array.from({ length: excludedCount }, () => card(false, true));
    const add = {
      width: 177,
      getBoundingClientRect: () => ({ right: 16 + (ordinary.length) * 189 + 177 - this.scrollLeft, width: 177 }),
    };
    this.tail = {
      style: { width: 0, setProperty: (_name: string, value: string) => { this.tail!.style.width = Number.parseFloat(value); } },
      getBoundingClientRect: () => ({ right: 0, width: this.tail!.style.width }),
    };
    this.children = [...ordinary, add, ...highlights, ...excluded, this.tail];
    this.anchor = add;
  }
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
    vi.stubGlobal("window", Object.assign(surface, {
      matchMedia: () => ({ matches: false }),
      getComputedStyle: () => ({ columnGap: "12px", paddingLeft: "16px", paddingRight: "16px" }),
    }));
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

  it.each([
    [0, 116.5],
    [1, 305.5],
    [2, 289.5],
    [4, 289.5],
  ])("returns with the expected highlighted preview for %i highlights", (highlightedCount, expectedRightReserve) => {
    track.useLayout(highlightedCount);
    track.clientWidth = 700;
    cleanup();
    cleanup = followRecordTrackEnd(track as unknown as HTMLDivElement);

    expect(track.dataset.returnTail).toBe(highlightedCount < 2 ? "true" : "false");
    expect(track.tail?.style.width).toBe(88.5);
    const addRight = track.anchor!.getBoundingClientRect().right;
    expect(addRight).toBeCloseTo(track.clientWidth - expectedRightReserve, 1);
    const withoutTail = 16 + track.children.filter((child) => child !== track.tail).length * 177
      + (track.children.filter((child) => child !== track.tail).length - 1) * 12 + 16;
    expect(track.scrollWidth).toBe(withoutTail + (highlightedCount < 2 ? 100.5 : 0));
  });

  it.each([[0, 1, 305.5], [0, 2, 289.5], [1, 1, 289.5]])("includes excluded records in the right preview (%i highlights, %i excluded)", (highlightedCount, excludedCount, reserve) => {
    track.useLayout(highlightedCount, 5, excludedCount);
    track.clientWidth = 700;
    cleanup();
    cleanup = followRecordTrackEnd(track as unknown as HTMLDivElement);
    expect(track.dataset.returnTail).toBe(highlightedCount + excludedCount < 2 ? "true" : "false");
    expect(track.anchor!.getBoundingClientRect().right).toBeCloseTo(track.clientWidth - reserve, 1);
  });

  it("does not reserve a tail when cards fit, and keeps the add card fully visible on a narrow track", () => {
    track.useLayout(0);
    track.clientWidth = 1200;
    cleanup();
    cleanup = followRecordTrackEnd(track as unknown as HTMLDivElement);
    expect(track.dataset.returnTail).toBe("false");
    expect(track.scrollWidth).toBe(1200);
    expect(track.scrollLeft).toBe(0);

    track.clientWidth = 220;
    resize();
    expect(track.dataset.returnTail).toBe("true");
    // The helper caps the reserve so the entire add card remains inside the viewport.
    const addRight = track.anchor!.getBoundingClientRect().right;
    expect(addRight).toBeLessThanOrEqual(track.clientWidth - 16 + 2);
    expect(addRight - 177).toBeGreaterThanOrEqual(16 - 2);
  });

  it("refreshes the tail on content changes without moving the user or restarting the idle deadline", () => {
    track.useLayout(0);
    track.clientWidth = 700;
    cleanup();
    cleanup = followRecordTrackEnd(track as unknown as HTMLDivElement);
    scrollBack();
    vi.advanceTimersByTime(5000);

    track.useLayout(2);
    mutate();
    expect(track.scrollLeft).toBe(100);
    expect(track.dataset.returnTail).toBe("false");

    vi.advanceTimersByTime(4999);
    expect(track.scrollLeft).toBe(100);
    vi.advanceTimersByTime(1);
    expect(track.clientWidth - track.anchor!.getBoundingClientRect().right).toBeCloseTo(289.5);
  });
});
