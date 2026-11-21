"use client";

import { Component, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { followRecordTrackEnd, stackableRecordPairs, unstackedRecordTrackWidth } from "../lib/record-track-scroll";
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

const stackMediaQuery = "(min-width: 761px) and (hover: hover) and (pointer: fine) and (not (any-pointer: coarse))";

function syncRecordStack(track: HTMLDivElement) {
  const width = track.clientWidth;
  const stacked = Boolean(window.matchMedia?.(stackMediaQuery)?.matches && width > 0
    && track.querySelector(stackableRecordPairs) && unstackedRecordTrackWidth(track) > width);
  if (stacked === track.hasAttribute("data-record-stack")) return false;

  const reflowing = track.hasAttribute("data-record-reflow");
  if (!reflowing) track.setAttribute("data-record-reflow", "");
  if (stacked) track.dataset.recordStack = "true";
  else delete track.dataset.recordStack;
  if (!reflowing) {
    // Resolve the resting spacing before re-enabling hover transitions.
    track.getBoundingClientRect();
    track.removeAttribute("data-record-reflow");
  }
  return true;
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
      if (children !== previous.children && syncRecordStack(track)) follow.current?.refresh();
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

export function RecordTrack({ children, movementKey, autoReturn = false }: { children: ReactNode; movementKey?: string; autoReturn?: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const follow = useRef<ReturnType<typeof followRecordTrackEnd> | null>(null);
  const [canJump, setCanJump] = useState(false);

  useLayoutEffect(() => {
    if (!autoReturn || !trackRef.current) return;
    const controller = followRecordTrackEnd(trackRef.current);
    follow.current = controller;
    return () => { follow.current = null; controller.dispose(); };
  }, [autoReturn]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const update = () => setCanJump(track.scrollWidth - track.clientWidth - track.scrollLeft > 2);
    const updateLayout = () => {
      if (syncRecordStack(track)) follow.current?.refresh();
      update();
    };
    const updateStackScroll = () => { if (track.hasAttribute("data-record-stack")) update(); };
    const settleSpacing = (event: TransitionEvent) => {
      if (!track.hasAttribute("data-record-stack") || event.propertyName !== "margin-left") return;
      const focused = track.querySelector(":focus-visible")?.closest(".record-card");
      if (focused && !track.querySelector(".record-card:hover")) {
        // Closing the previous gap can move a newly focused card after native focus scrolling.
        const card = focused.getBoundingClientRect(), viewport = track.getBoundingClientRect();
        const delta = card.left < viewport.left ? card.left - viewport.left : Math.max(0, card.right - viewport.right);
        if (delta) track.scrollTo({ left: track.scrollLeft + delta, behavior: "instant" });
      }
      update();
    };
    const observer = new ResizeObserver(updateLayout);
    observer.observe(track);
    for (const child of track.children) observer.observe(child);
    const cards = track.querySelectorAll<HTMLElement>(".record-card[data-record-status]");
    const viewport = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
      for (const entry of entries) entry.target.toggleAttribute("data-motion-outside", !entry.isIntersecting);
    }, { root: track });
    for (const card of cards) viewport?.observe(card);
    track.addEventListener("scroll", update, { passive: true });
    const stackEvents = ["pointerover", "pointerout", "focusin", "focusout", "transitioncancel"];
    for (const event of stackEvents) track.addEventListener(event, updateStackScroll);
    track.addEventListener("transitionend", settleSpacing);
    const media = window.matchMedia?.(stackMediaQuery);
    media?.addEventListener?.("change", updateLayout);
    update();
    return () => {
      observer.disconnect();
      viewport?.disconnect();
      track.removeEventListener("scroll", update);
      for (const event of stackEvents) track.removeEventListener(event, updateStackScroll);
      track.removeEventListener("transitionend", settleSpacing);
      media?.removeEventListener?.("change", updateLayout);
    };
  }, [children]);

  return <div className="record-track-container">
    <RecordTrackCards trackRef={trackRef} follow={follow} movementKey={movementKey}>{children}</RecordTrackCards>
    {canJump && <button
      className="record-track-jump"
      type="button"
      aria-label="跳到最后"
      title="跳到最后"
      onClick={() => {
        const track = trackRef.current;
        if (track) track.scrollTo({ left: track.scrollWidth, behavior: "instant" });
      }}
    ><span aria-hidden="true">»</span></button>}
  </div>;
}
