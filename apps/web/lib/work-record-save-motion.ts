const SAVE_MOTION_MS = 300;

function nextPaint(): Promise<void> {
  return new Promise(resolve => {
    const timer = window.setTimeout(finish, 50);
    const frame = requestAnimationFrame(finish);
    function finish() {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      resolve();
    }
  });
}

function recordCard(recordId: string | undefined) {
  return recordId ? [...document.querySelectorAll<HTMLElement>("[data-work-record-id]")]
    .find(card => card.dataset.workRecordId === recordId) : undefined;
}

// Refresh promises can resolve before React commits the new card to the DOM.
async function savedCard(recordId: string | undefined): Promise<HTMLElement | undefined> {
  await nextPaint();
  const existing = recordCard(recordId);
  if (existing || !recordId || !document.querySelector(".record-track")) return existing;
  return new Promise(resolve => {
    const observer = new MutationObserver(() => {
      const card = recordCard(recordId);
      if (card) finish(card);
    });
    const timer = window.setTimeout(() => finish(undefined), 150);
    function finish(card: HTMLElement | undefined) {
      observer.disconnect();
      window.clearTimeout(timer);
      resolve(card);
    }
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

/** Run only after a successful write and refresh; motion must never turn a save into a retry. */
export async function absorbWorkRecordDialog(dialog: HTMLElement | null, recordId: string | undefined): Promise<void> {
  if (!dialog?.isConnected || !dialog.animate || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const animations: Animation[] = [];
  let timer: number | undefined;
  try {
    const target = await savedCard(recordId);
    if (!dialog.isConnected) return;
    target?.scrollIntoView?.({ behavior: "instant", block: "nearest", inline: "nearest" });
    // Allow record-track scrolling and its ResizeObserver to settle before measuring.
    await nextPaint();
    const from = dialog.getBoundingClientRect();
    if (from.width <= 0 || from.height <= 0) return;
    const to = target?.getBoundingClientRect();
    const hasTarget = to && to.width > 0 && to.height > 0;
    const dx = hasTarget ? to.left + to.width / 2 - from.left - from.width / 2 : 0;
    const dy = hasTarget ? to.top + to.height / 2 - from.top - from.height / 2 : 24;
    const sx = hasTarget ? to.width / from.width : 0.35;
    const sy = hasTarget ? to.height / from.height : 0.35;
    dialog.inert = true;
    dialog.style.transformOrigin = "center";
    const flight = dialog.animate([
      { transform: "none", opacity: 1, offset: 0 },
      { transform: `translate(${dx * 0.05}px, ${dy * 0.02 - 8}px) scale(.97) rotate(-1deg)`, opacity: 0.98, offset: 0.18 },
      { transform: `translate(${dx * 0.7}px, ${dy * 0.65}px) scale(${sx}, ${sy}) rotate(1deg)`, opacity: 0.8, offset: 0.72 },
      { transform: `translate(${dx}px, ${dy}px) scale(${Math.min(sx * 0.12, 0.04)}, ${Math.min(sy * 0.12, 0.04)})`, opacity: 0, offset: 1 },
    ], { duration: SAVE_MOTION_MS, easing: "cubic-bezier(.45, 0, .7, 1)", fill: "forwards" });
    animations.push(flight);
    const backdrop = dialog.closest<HTMLElement>(".modal-backdrop");
    if (backdrop?.animate) animations.push(backdrop.animate([
      { backgroundColor: getComputedStyle(backdrop).backgroundColor }, { backgroundColor: "transparent" },
    ], { duration: SAVE_MOTION_MS, fill: "forwards" }));
    if (hasTarget && target?.animate) animations.push(target.animate([
      { transform: "scale(1)" }, { transform: "scale(1.035)" }, { transform: "scale(1)" },
    ], { duration: 120, delay: 180, easing: "ease-out" }));
    // A removed element or interrupted animation must not leave a saved form locked open.
    await Promise.race([
      flight.finished.catch(() => undefined),
      new Promise<void>(resolve => { timer = window.setTimeout(resolve, SAVE_MOTION_MS + 50); }),
    ]);
    dialog.style.visibility = "hidden";
    if (target?.isConnected) target.focus({ preventScroll: true });
  } catch {
    // Presentation failures do not invalidate the already committed record.
  } finally {
    window.clearTimeout(timer);
    for (const animation of animations) animation.cancel();
  }
}
