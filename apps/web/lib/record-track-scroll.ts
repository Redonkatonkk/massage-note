/** Keep an open day's add-record card in view without interrupting manual browsing. */
export function followRecordTrackEnd(track: HTMLDivElement) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pointers = new Set<number>();
  const atEnd = () => track.scrollWidth - track.clientWidth - track.scrollLeft <= 2;
  const clearTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const jump = (smooth = false) => {
    clearTimer();
    track.scrollTo({
      left: track.scrollWidth,
      behavior: smooth && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "instant",
    });
  };
  const schedule = () => {
    clearTimer();
    if (!atEnd() && pointers.size === 0) timer = setTimeout(() => jump(true), 10_000);
  };
  const pointerDown = (event: PointerEvent) => {
    pointers.add(event.pointerId);
    clearTimer();
  };
  const pointerUp = (event: PointerEvent) => {
    if (pointers.delete(event.pointerId)) schedule();
  };
  const resize = new ResizeObserver(() => {
    // Preserve the user's reading interval when records refresh or the viewport changes.
    if (timer === undefined && pointers.size === 0) jump();
  });
  const observeChildren = () => {
    resize.disconnect();
    resize.observe(track);
    for (const child of track.children) resize.observe(child);
  };
  const mutations = new MutationObserver(observeChildren);
  mutations.observe(track, { childList: true });
  observeChildren();
  jump();
  track.addEventListener("scroll", schedule, { passive: true });
  track.addEventListener("wheel", schedule, { passive: true });
  track.addEventListener("keydown", schedule);
  track.addEventListener("pointerdown", pointerDown);
  window.addEventListener("pointerup", pointerUp);
  window.addEventListener("pointercancel", pointerUp);
  return () => {
    clearTimer();
    resize.disconnect();
    mutations.disconnect();
    track.removeEventListener("scroll", schedule);
    track.removeEventListener("wheel", schedule);
    track.removeEventListener("keydown", schedule);
    track.removeEventListener("pointerdown", pointerDown);
    window.removeEventListener("pointerup", pointerUp);
    window.removeEventListener("pointercancel", pointerUp);
  };
}
