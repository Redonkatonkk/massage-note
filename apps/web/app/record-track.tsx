"use client";

import { Component, useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { followRecordTrackEnd, unstackedRecordTrackWidth } from "../lib/record-track-scroll";
import { allowsMotion, animateListItemMove } from "./ui/interaction-motion";

interface RecordTrackCardsProps {
  trackRef: RefObject<HTMLDivElement | null>;
  follow: RefObject<ReturnType<typeof followRecordTrackEnd> | null>;
  movementKey: string | undefined;
  children: ReactNode;
}

function measureCards(track: HTMLDivElement) {
  const viewport = track.getBoundingClientRect();
  return Array.from(track.querySelectorAll<HTMLElement>(":scope > [data-motion-item]"), card => {
    const box = card.getBoundingClientRect();
    return { card, left: box.left - viewport.left, right: box.right - viewport.left };
  });
}

const stackMediaQuery = "(hover: hover) and (pointer: fine) and (not (any-pointer: coarse))";
const minimumExposedCardWidth = 56;

function measureRecordTrackLayout(track: HTMLDivElement) {
  const width = track.clientWidth;
  if (!width || !window.matchMedia?.(stackMediaQuery)?.matches) return;

  const style = window.getComputedStyle(track);
  const overflow = unstackedRecordTrackWidth(track, style) - width;
  if (overflow <= 0) return;

  const pairs = track.querySelectorAll<HTMLElement>(
    ":scope > .record-card:not(.record-card--right-group) + .record-card:not(.record-card--right-group), :scope > .record-card--right-group + .record-card--right-group",
  );
  const gap = parseFloat(style.columnGap) || 0;
  let inset = pairs.length ? Math.ceil(overflow / pairs.length) : 0;
  for (const card of pairs) {
    const exposed = card.classList.contains("record-card--right-group") ? card : card.previousElementSibling as HTMLElement;
    const maxInset = Math.max(0, Math.floor(exposed.offsetWidth + gap - minimumExposedCardWidth));
    inset = Math.min(inset, maxInset);
  }

  const scrollable = overflow > inset * pairs.length;
  const sideSpace = Math.max(0, (track.parentElement?.clientWidth ?? width) - width);
  const sideReveal = Math.floor(sideSpace / 1.1);
  // A scrollport clips the side column. Open after the active card when it cannot move into that space.
  const revealAfter = scrollable || sideReveal === 0;
  const reveal = revealAfter ? inset : Math.min(inset, sideReveal);
  return { inset, reveal, scrollable, revealAfter };
}

function syncRecordStack(track: HTMLDivElement) {
  const layout = measureRecordTrackLayout(track);
  const overlap = layout?.inset ?? 0;
  const stacked = overlap > 0;
  const scrollable = layout?.scrollable ?? false;
  const revealAfter = stacked && layout?.revealAfter === true;
  const inset = stacked ? `${-overlap}px` : "";
  const openInset = stacked ? `${(layout?.reveal ?? 0) - overlap}px` : "";
  const layer = stacked ? String(track.children.length) : "";
  if (track.style.getPropertyValue("--record-stack-inset") === inset
    && track.style.getPropertyValue("--record-stack-open-inset") === openInset
    && track.style.getPropertyValue("--record-stack-front") === layer
    && track.hasAttribute("data-record-scroll") === scrollable
    && track.hasAttribute("data-record-reveal-after") === revealAfter) return;

  const reflowing = track.hasAttribute("data-record-reflow");
  if (!reflowing) track.setAttribute("data-record-reflow", "");
  track.style.setProperty("--record-stack-inset", inset);
  track.style.setProperty("--record-stack-open-inset", openInset);
  track.style.setProperty("--record-stack-front", layer);
  track.toggleAttribute("data-record-stack", stacked);
  track.toggleAttribute("data-record-scroll", scrollable);
  track.toggleAttribute("data-record-reveal-after", revealAfter);
  if (!reflowing) {
    // Resolve the resting spacing before re-enabling hover transitions.
    track.getBoundingClientRect();
    track.removeAttribute("data-record-reflow");
  }
}

// Capture the visible positions before React changes card order, overlap, or scroll bounds.
class RecordTrackCards extends Component<RecordTrackCardsProps> {
  private moves = new Set<Animation>();

  componentDidMount() {
    const track = this.props.trackRef.current;
    if (track) syncRecordStack(track);
  }

  getSnapshotBeforeUpdate(previous: RecordTrackCardsProps) {
    const { trackRef, movementKey } = this.props;
    const track = trackRef.current;
    if (!track || movementKey === undefined || movementKey === previous.movementKey || !allowsMotion()) return null;
    return new Map(measureCards(track).map(box => [box.card.dataset.motionItem, box]));
  }

  componentDidUpdate(previous: RecordTrackCardsProps, _state: unknown, before: ReturnType<RecordTrackCards["getSnapshotBeforeUpdate"]>) {
    const { trackRef, follow, movementKey, children } = this.props;
    const track = trackRef.current;
    if (!track) return;
    if (movementKey === previous.movementKey) {
      if (children !== previous.children) syncRecordStack(track);
      return;
    }
    this.stopMoves();

    // Apply the resting stack layout and scroll position in the same commit.
    track.setAttribute("data-record-reflow", "");
    let after;
    try {
      syncRecordStack(track);
      follow.current?.refresh();
      after = before && measureCards(track);
    } finally { track.removeAttribute("data-record-reflow"); }
    if (!before || !after) return;
    const width = track.clientWidth;

    for (const { card, left, right } of after) {
      const from = before.get(card.dataset.motionItem);
      if (!from || Math.max(from.right, right) <= 0 || Math.min(from.left, left) >= width) continue;
      const move = animateListItemMove(card, from.left - left);
      if (!move) continue;
      this.moves.add(move);
      const forget = () => { this.moves.delete(move); };
      void move.finished.then(forget, forget);
    }
  }

  private stopMoves() {
    for (const move of this.moves) move.cancel();
    this.moves.clear();
  }

  componentWillUnmount() { this.stopMoves(); }

  render() {
    const { trackRef, children } = this.props;
    return <div className="record-track" ref={trackRef} data-motion-list>{children}<span className="record-track-tail" aria-hidden="true" /></div>;
  }
}

export function RecordTrack({ children, movementKey, alignAddRecord = false }: { children: ReactNode; movementKey?: string; alignAddRecord?: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const follow = useRef<ReturnType<typeof followRecordTrackEnd> | null>(null);

  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const media = window.matchMedia?.(stackMediaQuery);
    const stopFollowing = () => {
      follow.current?.dispose();
      follow.current = null;
    };
    const updateMode = () => {
      if (media?.matches) stopFollowing();
      syncRecordStack(track);
      if (alignAddRecord && !media?.matches && !follow.current) follow.current = followRecordTrackEnd(track);
    };
    updateMode();
    media?.addEventListener?.("change", updateMode);
    return () => {
      stopFollowing();
      media?.removeEventListener?.("change", updateMode);
    };
  }, [alignAddRecord]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const observer = new ResizeObserver(() => syncRecordStack(track));
    observer.observe(track);
    if (track.parentElement) observer.observe(track.parentElement);
    for (const child of track.children) observer.observe(child);
    const cards = track.querySelectorAll<HTMLElement>(".record-card[data-record-status]");
    const viewport = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
      for (const entry of entries) entry.target.toggleAttribute("data-motion-outside", !entry.isIntersecting);
    }, { root: track });
    for (const card of cards) viewport?.observe(card);
    return () => {
      observer.disconnect();
      viewport?.disconnect();
    };
  }, [children]);

  return <RecordTrackCards trackRef={trackRef} follow={follow} movementKey={movementKey}>{children}</RecordTrackCards>;
}
