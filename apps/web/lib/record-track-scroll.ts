export const stackableRecordPairs = ".record-card + .record-card:not(.record-card--right-group), .record-card--right-group + .record-card--right-group";

/** Measure full card spacing without the reserve for automatic return. */
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
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pointers = new Set<number>();
  let rightReserve = 16;
  const activeStackInset = (style?: CSSStyleDeclaration) => track.dataset.recordStack
    ? parseFloat((style ?? window.getComputedStyle(track)).getPropertyValue("--record-stack-inset")) || 0
    : 0;
  const engagedCard = () => activeStackInset() && track.querySelector(".record-card:is(:hover, :focus-visible, :has(:focus-visible))");
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
    // Reserve space from resting overlaps so the reveal never changes the home position.
    const stackInset = activeStackInset(style);
    const stackOffset = stackInset ? stackInset * track.querySelectorAll(stackableRecordPairs).length : 0;
    const contentWidth = unstackedRecordTrackWidth(track, style) + stackOffset;
    const overflowing = contentWidth > track.clientWidth + 1;
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
  const getTarget = () => {
    const anchor = track.querySelector<HTMLElement>(".add-record");
    const maxScroll = track.scrollWidth - track.clientWidth;
    if (!anchor) return Math.max(0, maxScroll);
    // The track is the offset parent. Measure the layout anchor without its animated translation.
    return Math.max(0, Math.min(
      maxScroll,
      anchor.offsetLeft + anchor.offsetWidth - track.clientWidth + rightReserve,
    ));
  };
  const atTarget = () => Math.abs(track.scrollLeft - getTarget()) <= 2;
  const clearTimer = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const jump = (smooth = false) => {
    clearTimer();
    if (engagedCard()) return;
    const left = getTarget();
    if (Math.abs(track.scrollLeft - left) <= 0.5) return;
    track.scrollTo({
      left,
      behavior: smooth && !window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "instant",
    });
  };
  const schedule = () => {
    clearTimer();
    if (!atTarget() && pointers.size === 0) timer = setTimeout(() => jump(true), 10_000);
  };
  const resumeAfterStackInteraction = () => { if (activeStackInset()) schedule(); };
  const pointerDown = (event: PointerEvent) => {
    pointers.add(event.pointerId);
    clearTimer();
  };
  const pointerUp = (event: PointerEvent) => {
    if (pointers.delete(event.pointerId)) schedule();
  };
  const refresh = () => {
    refreshLayout();
    // Preserve the user's reading interval when records refresh or the viewport changes.
    if (timer === undefined && pointers.size === 0) jump();
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
  mutations.observe(track, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "data-record-stack"] });
  observeChildren();
  refresh();
  track.addEventListener("scroll", schedule, { passive: true });
  track.addEventListener("wheel", schedule, { passive: true });
  track.addEventListener("keydown", schedule);
  track.addEventListener("pointerleave", resumeAfterStackInteraction);
  track.addEventListener("focusout", resumeAfterStackInteraction);
  track.addEventListener("pointerdown", pointerDown);
  window.addEventListener("pointerup", pointerUp);
  window.addEventListener("pointercancel", pointerUp);
  const dispose = () => {
    clearTimer();
    resize.disconnect();
    mutations.disconnect();
    track.removeAttribute("data-return-tail");
    track.removeEventListener("scroll", schedule);
    track.removeEventListener("wheel", schedule);
    track.removeEventListener("keydown", schedule);
    track.removeEventListener("pointerleave", resumeAfterStackInteraction);
    track.removeEventListener("focusout", resumeAfterStackInteraction);
    track.removeEventListener("pointerdown", pointerDown);
    window.removeEventListener("pointerup", pointerUp);
    window.removeEventListener("pointercancel", pointerUp);
  };
  return { refresh, dispose };
}
