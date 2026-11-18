"use client";

import { Component, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { followRecordTrackEnd } from "../lib/record-track-scroll";
import { allowsMotion, animateListItemMove } from "./ui/interaction-motion";

interface RecordTrackCardsProps {
  trackRef: RefObject<HTMLDivElement | null>;
  follow: RefObject<ReturnType<typeof followRecordTrackEnd> | null>;
  stacked: boolean;
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

// Capture the visible positions before React changes card order, overlap, or scroll bounds.
class RecordTrackCards extends Component<RecordTrackCardsProps> {
  private moves = new Set<Animation>();

  getSnapshotBeforeUpdate(previous: RecordTrackCardsProps) {
    const { trackRef, movementKey } = this.props;
    const track = trackRef.current;
    if (!track || movementKey === undefined || movementKey === previous.movementKey || !allowsMotion()) return null;
    return new Map(measureCards(track).map(box => [box.card.dataset.motionItem, box]));
  }

  componentDidUpdate(previous: RecordTrackCardsProps, _state: unknown, before: ReturnType<RecordTrackCards["getSnapshotBeforeUpdate"]>) {
    const { trackRef, follow, movementKey } = this.props;
    const track = trackRef.current;
    if (!track || movementKey === previous.movementKey) return;
    this.stopMoves();
    if (!before) { follow.current?.refresh(); return; }

    // Apply the resting stack layout and scroll position in the same commit.
    track.setAttribute("data-record-reflow", "");
    let after;
    try {
      follow.current?.refresh();
      after = measureCards(track);
    } finally { track.removeAttribute("data-record-reflow"); }
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
    const { trackRef, stacked, children } = this.props;
    return <div className="record-track" ref={trackRef} data-motion-list data-record-stack={stacked || undefined}>{children}<span className="record-track-tail" aria-hidden="true" /></div>;
  }
}

export function RecordTrack({ children, recordCount, movementKey, autoReturn = false }: { children: ReactNode; recordCount: number; movementKey?: string; autoReturn?: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const follow = useRef<ReturnType<typeof followRecordTrackEnd> | null>(null);
  const [canJump, setCanJump] = useState(false);
  const stacked = recordCount >= 5;

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
    const settleSpacing = (event: TransitionEvent) => {
      if (event.propertyName !== "margin-left") return;
      const focused = track.querySelector(":focus-visible")?.closest(".record-card");
      if (focused && !track.querySelector(".record-card:hover")) {
        // Closing the previous gap can move a newly focused card after native focus scrolling.
        const card = focused.getBoundingClientRect(), viewport = track.getBoundingClientRect();
        const delta = card.left < viewport.left ? card.left - viewport.left : Math.max(0, card.right - viewport.right);
        if (delta) track.scrollTo({ left: track.scrollLeft + delta, behavior: "instant" });
      }
      update();
    };
    const observer = new ResizeObserver(update);
    observer.observe(track);
    for (const child of track.children) observer.observe(child);
    const cards = track.querySelectorAll<HTMLElement>(".record-card[data-record-status]");
    const viewport = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(entries => {
      for (const entry of entries) entry.target.toggleAttribute("data-motion-outside", !entry.isIntersecting);
    }, { root: track });
    for (const card of cards) viewport?.observe(card);
    track.addEventListener("scroll", update, { passive: true });
    const stackEvents = stacked ? ["pointerover", "pointerout", "focusin", "focusout", "transitioncancel"] : [];
    for (const event of stackEvents) track.addEventListener(event, update);
    if (stacked) track.addEventListener("transitionend", settleSpacing);
    update();
    return () => {
      observer.disconnect();
      viewport?.disconnect();
      track.removeEventListener("scroll", update);
      for (const event of stackEvents) track.removeEventListener(event, update);
      if (stacked) track.removeEventListener("transitionend", settleSpacing);
    };
  }, [children, stacked]);

  return <div className="record-track-container">
    <RecordTrackCards trackRef={trackRef} follow={follow} stacked={stacked} movementKey={movementKey}>{children}</RecordTrackCards>
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
