/** Measure full card spacing without the touch layout's trailing reserve. */
export function unstackedRecordTrackWidth(track: HTMLDivElement, style = window.getComputedStyle(track)) {
  const tail = track.querySelector(".record-track-tail");
  const cards = [...track.children].filter((child) => child !== tail) as HTMLElement[];
  const gap = parseFloat(style.columnGap) || 0;
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;
  return cards.reduce((width, card) => width + card.offsetWidth, 0)
    + Math.max(0, cards.length - 1) * gap + paddingLeft + paddingRight;
}

/** Keep an open day's add-record card in view without interrupting manual browsing. */
export function followRecordTrackEnd(track: HTMLDivElement) {
  let target: number | undefined;
  const pointers = new Set<number>();
  let rightReserve = 16;
  const refreshLayout = () => {
    const anchor = track.querySelector<HTMLElement>(".add-record");
    const tail = track.querySelector<HTMLElement>(".record-track-tail");
    if (!anchor || !tail) {
      rightReserve = 16;
      track.removeAttribute("data-return-tail");
      return;
    }
    const style = window.getComputedStyle(track);
    const gap = parseFloat(style.columnGap) || 0;
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingRight = parseFloat(style.paddingRight) || 0;
    const cardWidth = anchor.offsetWidth;
    const overflowing = unstackedRecordTrackWidth(track, style) > track.clientWidth + 1;
    const rightGroupCount = track.querySelectorAll(".record-card--right-group").length;
    const mobile = window.matchMedia("(max-width: 760px)").matches;
    // Phones preview half the preceding record beside the complete add card.
    const desiredReserve = mobile
      ? Math.max(paddingRight, track.clientWidth - cardWidth * 1.5 - gap)
      : rightGroupCount >= 2
        ? cardWidth * 1.5 + gap * 2
        : rightGroupCount * (cardWidth + gap) + gap + cardWidth / 2 + paddingRight;
    // On a narrow phone, showing the whole add card takes priority over the preview.
    rightReserve = overflowing
      ? Math.min(desiredReserve, Math.max(paddingRight, track.clientWidth - cardWidth - paddingLeft))
      : paddingRight;
    const tailWidth = mobile
      ? Math.max(0, rightReserve - rightGroupCount * (cardWidth + gap) - gap - paddingRight)
      : cardWidth / 2;
    const showTail = overflowing && (mobile ? tailWidth > 0 : rightGroupCount < 2);
    track.dataset.returnTail = String(showTail);
    tail.style.setProperty("--record-track-tail-width", `${tailWidth}px`);
  };
  const maxScroll = () => Math.max(0, track.scrollWidth - track.clientWidth);
  const getTarget = () => {
    const anchor = track.querySelector<HTMLElement>(".add-record");
    if (!anchor) return maxScroll();
    // The track is the offset parent. Measure the layout anchor without its animated translation.
    return Math.max(0, Math.min(
      maxScroll(),
      anchor.offsetLeft + anchor.offsetWidth - track.clientWidth + rightReserve,
    ));
  };
  const pointerDown = (event: PointerEvent) => { pointers.add(event.pointerId); };
  const pointerUp = (event: PointerEvent) => { pointers.delete(event.pointerId); };
  const refresh = () => {
    // Check the previous anchor before recomputing it. A resize may have clamped the scroll offset.
    const wasAligned = target === undefined || Math.abs(track.scrollLeft - Math.min(target, maxScroll())) <= 2;
    refreshLayout();
    target = getTarget();
    if (wasAligned && pointers.size === 0 && Math.abs(track.scrollLeft - target) > 0.5) {
      track.scrollTo({ left: target, behavior: "instant" });
    }
  };
  const resize = new ResizeObserver(refresh);
  const observeChildren = () => {
    resize.disconnect();
    resize.observe(track);
    for (const child of track.children) resize.observe(child);
  };
  const contentChanged = () => {
    observeChildren();
    refresh();
  };
  const mutations = new MutationObserver(contentChanged);
  mutations.observe(track, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  observeChildren();
  refresh();
  track.addEventListener("pointerdown", pointerDown);
  window.addEventListener("pointerup", pointerUp);
  window.addEventListener("pointercancel", pointerUp);
  const dispose = () => {
    resize.disconnect();
    mutations.disconnect();
    track.removeAttribute("data-return-tail");
    track.removeEventListener("pointerdown", pointerDown);
    window.removeEventListener("pointerup", pointerUp);
    window.removeEventListener("pointercancel", pointerUp);
  };
  return { refresh, dispose };
}
