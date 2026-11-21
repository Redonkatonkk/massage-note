import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { followRecordTrackEnd } from "./record-track-scroll";

class Track extends EventTarget {
  private fixedScrollWidth = 1200;
  clientWidth = 400;
  scrollLeft = 0;
  children: Array<{ offsetWidth?: number; highlighted?: boolean; excluded?: boolean; getBoundingClientRect?: () => { right: number; width: number } }> = [];
  dataset: Record<string, string | undefined> = {};
  anchor: { offsetLeft: number; offsetWidth: number; getBoundingClientRect: () => { right: number; width: number } } | null = null;
  tail: { style: { width: number; setProperty: (name: string, value: string) => void }; getBoundingClientRect: () => { right: number; width: number } } | null = null;
  get scrollWidth() {
    if (!this.anchor || !this.tail) return this.fixedScrollWidth;
    const cards = this.children.filter((child) => child !== this.tail);
    const width = 16 + cards.length * 177 + Math.max(0, cards.length - 1) * 12 + 16
      + (this.dataset.returnTail === "true" ? 12 + this.tail.style.width : 0);
    return Math.max(this.clientWidth, width);
  }
  set scrollWidth(value: number) { this.fixedScrollWidth = value; }
  querySelector(selector: string): object | null {
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

  setAnchor(right: number, translation = 0) {
    this.anchor = {
      offsetLeft: right - 177, offsetWidth: 177,
      getBoundingClientRect: () => ({ right: right - this.scrollLeft + translation, width: 177 }),
    };
  }

  useLayout(highlightedCount: number, ordinaryCount = 5, excludedCount = 0) {
    const card = (highlighted: boolean, excluded = false) => ({
      offsetWidth: 177,
      highlighted,
      excluded,
      getBoundingClientRect: () => ({ right: 0, width: 177 }),
    });
    const ordinary = Array.from({ length: ordinaryCount }, () => card(false));
    const highlights = Array.from({ length: highlightedCount }, () => card(true));
    const excluded = Array.from({ length: excludedCount }, () => card(false, true));
    this.setAnchor(16 + ordinary.length * 189 + 177);
    this.tail = {
      style: { width: 0, setProperty: (_name: string, value: string) => { this.tail!.style.width = Number.parseFloat(value); } },
      getBoundingClientRect: () => ({ right: 0, width: this.tail!.style.width }),
    };
    this.children = [...ordinary, this.anchor!, ...highlights, ...excluded, this.tail];
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
    cleanup = followRecordTrackEnd(track as unknown as HTMLDivElement).dispose;
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });
  it("opens at the end and keeps the manual position indefinitely", () => {
    expect(track.scrollLeft).toBe(800);
    scrollBack();
    vi.advanceTimersByTime(60_000);
    expect(track.scrollLeft).toBe(100);
    expect(track.scrollTo).toHaveBeenCalledExactlyOnceWith({ left: 800, behavior: "instant" });
  });
  it("does not move an aligned track during a touch gesture", () => {
    pointer(track, "pointerdown");
    track.scrollWidth = 1500;
    resize();
    expect(track.scrollLeft).toBe(800);
    pointer(surface, "pointercancel");
    track.scrollLeft = 1100;
    track.scrollWidth = 1700;
    resize();
    expect(track.scrollLeft).toBe(1300);
  });
  it("follows new content only when still aligned", () => {
    track.scrollWidth = 1500;
    resize();
    expect(track.scrollLeft).toBe(1100);
    scrollBack();
    track.scrollWidth = 1800;
    resize();
    expect(track.scrollLeft).toBe(100);
    vi.advanceTimersByTime(10_000);
    expect(track.scrollLeft).toBe(100);
  });
  it("aligns the add-record card 16px from the right edge and permits browsing both directions", () => {
    // Its right edge is at content coordinate 700, so scrollLeft 316 leaves 16px.
    track.setAnchor(700);
    cleanup();
    cleanup = followRecordTrackEnd(track as unknown as HTMLDivElement).dispose;
    expect(track.scrollLeft).toBe(316);

    track.scrollLeft = 100;
    track.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(5000);
    track.scrollLeft = 500;
    track.dispatchEvent(new Event("scroll"));
    vi.advanceTimersByTime(10_000);
    expect(track.scrollLeft).toBe(500);
    expect(track.scrollTo).toHaveBeenLastCalledWith({ left: 316, behavior: "instant" });
  });
  it("updates the followed anchor after reorder or highlight changes when dimensions stay the same", () => {
    track.setAnchor(700);
    cleanup();
    cleanup = followRecordTrackEnd(track as unknown as HTMLDivElement).dispose;
    track.setAnchor(1000);
    mutate();
    expect(track.scrollLeft).toBe(616);

    scrollBack();
    track.setAnchor(900);
    mutate();
    vi.advanceTimersByTime(10_000);
    expect(track.scrollLeft).toBe(100);
  });

  it("follows the add card's layout position while its visible position animates", () => {
    track.setAnchor(700);
    mutate();
    expect(track.scrollLeft).toBe(316);

    track.setAnchor(889, -189);
    mutate();
    expect(track.scrollLeft).toBe(505);
    const jumps = track.scrollTo.mock.calls.length;
    resize();
    expect(track.scrollTo).toHaveBeenCalledTimes(jumps);
  });
  it("keeps the manual position through resize without an add-record card", () => {
    scrollBack();
    track.clientWidth = 500;
    resize();
    expect(track.scrollLeft).toBe(100);
  });

  it.each([
    [0, 116.5],
    [1, 305.5],
    [2, 289.5],
    [4, 289.5],
  ])("opens with the expected highlighted preview for %i highlights", (highlightedCount, expectedRightReserve) => {
    track.useLayout(highlightedCount);
    track.clientWidth = 700;
    cleanup();
    cleanup = followRecordTrackEnd(track as unknown as HTMLDivElement).dispose;

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
    cleanup = followRecordTrackEnd(track as unknown as HTMLDivElement).dispose;
    expect(track.dataset.returnTail).toBe(highlightedCount + excludedCount < 2 ? "true" : "false");
    expect(track.anchor!.getBoundingClientRect().right).toBeCloseTo(track.clientWidth - reserve, 1);
  });

  it.each([[286, 81], [328, 88.5], [358, 88.5], [382, 88.5], [448, 88.5], [728, 88.5]])("previews the preceding card beside the full add card on a %ipx mobile track", (width, previewWidth) => {
    vi.stubGlobal("window", Object.assign(surface, {
      matchMedia: (query: string) => ({ matches: query === "(max-width: 760px)" }),
    }));
    track.clientWidth = width;
    for (const rightGroupCount of [0, 1, 2, 4]) {
      cleanup();
      track.useLayout(rightGroupCount);
      cleanup = followRecordTrackEnd(track as unknown as HTMLDivElement).dispose;

      const addRight = track.anchor!.getBoundingClientRect().right;
      expect(addRight - 177 - 12).toBeCloseTo(previewWidth);
      expect(addRight).toBeLessThanOrEqual(width - 16);
      expect(track.dataset.returnTail).toBe(track.tail!.style.width > 0 ? "true" : "false");
    }
    scrollBack();
    vi.advanceTimersByTime(10_000);
    expect(track.scrollLeft).toBe(100);
  });

  it("recalculates touch alignment across breakpoints while preserving manual browsing", () => {
    let mobile = true;
    vi.stubGlobal("window", Object.assign(surface, {
      matchMedia: (query: string) => ({ matches: mobile && query === "(max-width: 760px)" }),
    }));
    track.useLayout(1);
    cleanup();
    cleanup = followRecordTrackEnd(track as unknown as HTMLDivElement).dispose;
    expect(track.anchor!.getBoundingClientRect().right).toBeCloseTo(277.5);

    scrollBack();
    mobile = false;
    track.clientWidth = 700;
    resize();
    expect(track.scrollLeft).toBe(100);

    const addRightInTrack = track.anchor!.offsetLeft + track.anchor!.offsetWidth;
    track.scrollLeft = addRightInTrack - (700 - 305.5);
    mobile = true;
    track.clientWidth = 220;
    resize();
    const addRight = track.anchor!.getBoundingClientRect().right;
    expect(addRight).toBeLessThanOrEqual(220 - 16);
    expect(addRight - 177).toBeGreaterThanOrEqual(16);

    track.useLayout(0, 0);
    track.scrollLeft = 0; // Native clamping once all cards fit.
    mutate();
    expect(track.scrollLeft).toBe(0);
    expect(track.dataset.returnTail).toBe("false");
  });

  it("does not reserve a tail when cards fit, and keeps the add card fully visible on a narrow track", () => {
    track.useLayout(0);
    track.clientWidth = 1200;
    cleanup();
    cleanup = followRecordTrackEnd(track as unknown as HTMLDivElement).dispose;
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

  it("refreshes the tail on content changes without moving the user", () => {
    track.useLayout(0);
    track.clientWidth = 700;
    cleanup();
    cleanup = followRecordTrackEnd(track as unknown as HTMLDivElement).dispose;
    scrollBack();
    track.useLayout(2);
    mutate();
    expect(track.scrollLeft).toBe(100);
    expect(track.dataset.returnTail).toBe("false");

    vi.advanceTimersByTime(10_000);
    expect(track.scrollLeft).toBe(100);
  });
});
