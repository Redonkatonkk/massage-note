"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { followRecordTrackEnd } from "../lib/record-track-scroll";

export function RecordTrack({ children, autoReturn = false }: { children: ReactNode; autoReturn?: boolean }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [canJump, setCanJump] = useState(false);

  useEffect(() => {
    if (autoReturn && trackRef.current) return followRecordTrackEnd(trackRef.current);
  }, [autoReturn]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const update = () => setCanJump(track.scrollWidth - track.clientWidth - track.scrollLeft > 2);
    const observer = new ResizeObserver(update);
    observer.observe(track);
    for (const child of track.children) observer.observe(child);
    track.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      observer.disconnect();
      track.removeEventListener("scroll", update);
    };
  }, [children]);

  return <div className="record-track-container">
    <div className="record-track" ref={trackRef}>{children}</div>
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
