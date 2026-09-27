/** Keep an open day's add-record card in view without interrupting manual browsing. */
export function followRecordTrackEnd(track: HTMLDivElement) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pointers = new Set<number>();
  const getTarget = () => {
    const anchor = track.querySelector<HTMLElement>(".add-record");
    if (!anchor) return Math.max(0, track.scrollWidth - track.clientWidth);
    const trackRect = track.getBoundingClientRect();
    const anchorRect = anchor.getBoundingClientRect();
    return Math.max(0, Math.min(
      track.scrollWidth - track.clientWidth,
      track.scrollLeft + anchorRect.right - trackRect.left - track.clientWidth + 16,
    ));
  };
  const atTarget = () => Math.abs(track.scrollLeft - getTarget()) <= 2;
  const clearTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const jump = (smooth = false) => {
    clearTimer();
    track.scrollTo({
      left: getTarget(),
      behavior: smooth && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "instant",
    });
  };
  const schedule = () => {
    clearTimer();
    if (!atTarget() && pointers.size === 0) timer = setTimeout(() => jump(true), 10_000);
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
  const contentChanged = () => {
    observeChildren();
    // Reposition immediately only when already following. A pending return keeps
    // its original deadline while the user is reading through updated content.
    if (timer === undefined && pointers.size === 0) jump();
  };
  const mutations = new MutationObserver(contentChanged);
  mutations.observe(track, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
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
