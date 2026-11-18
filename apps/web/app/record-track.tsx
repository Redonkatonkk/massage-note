"use client";

import { useEffect, useState, type ReactNode } from "react";
import { followRecordTrackEnd } from "../lib/record-track-scroll";
import { useWorkRecordExperiment } from "./work-record-experiment";
import { useListMotion } from "./ui/interaction-motion";

export function RecordTrack({ children, recordCount, movementKey, autoReturn = false }: { children: ReactNode; recordCount: number; movementKey?: string; autoReturn?: boolean }) {
  const trackRef = useListMotion<HTMLDivElement>(movementKey ?? "", movementKey !== undefined);
  const [canJump, setCanJump] = useState(false);
  const { experimental } = useWorkRecordExperiment();
  const stacked = experimental && recordCount >= 5;

  useEffect(() => {
    if (autoReturn && trackRef.current) return followRecordTrackEnd(trackRef.current);
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
    <div className="record-track" ref={trackRef} data-motion-list data-record-stack={stacked || undefined}>{children}<span className="record-track-tail" aria-hidden="true" /></div>
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
