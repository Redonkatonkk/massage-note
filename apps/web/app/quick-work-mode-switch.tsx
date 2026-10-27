"use client";

import { useLayoutEffect, useRef } from "react";
import { quickModeMotion, type CapsuleBounds } from "../lib/quick-mode-motion";
import { useLanguage } from "./language-provider";

const modes = [
  { value: "NORMAL", label: "正常排工" },
  { value: "PLACEHOLDER", label: "占位" },
  { value: "DISPATCH_EXCLUDED", label: "不算排工" },
  { value: "HIGHLIGHTED", label: "高亮标记" },
] as const;

export type QuickWorkMode = (typeof modes)[number]["value"];

export function QuickWorkModeSwitch({ value, disabled, onChange }: {
  value: QuickWorkMode;
  disabled: boolean;
  onChange: (mode: QuickWorkMode) => void;
}) {
  const { locale } = useLanguage();
  const trackRef = useRef<HTMLDivElement>(null);
  const capsuleRef = useRef<HTMLSpanElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const surfaceAnimationRef = useRef<Animation | null>(null);
  const previousColor = useRef("");
  const previousValue = useRef(value);

  useLayoutEffect(() => {
    const track = trackRef.current!;
    const capsule = capsuleRef.current!;
    const surface = track.closest<HTMLElement>(".quick-work-modal");
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    function position(animate: boolean) {
      const selected = track.querySelector<HTMLElement>('[aria-checked="true"]');
      if (!selected) return;
      const origin = track.getBoundingClientRect();
      const target = selected.getBoundingClientRect();
      const current = capsule.getBoundingClientRect();
      const relative = (rect: DOMRect): CapsuleBounds => ({ left: rect.left - origin.left, top: rect.top - origin.top, width: rect.width, height: rect.height });
      const from = relative(current);
      const to = relative(target);
      const color = getComputedStyle(track).getPropertyValue("--quick-mode-color").trim();
      // ResizeObserver also reports its initial observation after each mode change.
      // An unchanged target must not cancel the animation that has just started.
      if (!animate && !reducedMotion?.matches && capsule.style.left === `${to.left}px`
        && capsule.style.top === `${to.top}px` && capsule.style.width === `${to.width}px`
        && capsule.style.height === `${to.height}px` && previousColor.current === color) return;
      const fromColor = previousColor.current || color;
      const fromCapsuleColor = animationRef.current?.playState === "running" ? getComputedStyle(capsule).backgroundColor : fromColor;
      const fromSurfaceColor = surfaceAnimationRef.current?.playState === "running" && surface ? getComputedStyle(surface).backgroundColor : fromColor;
      animationRef.current?.cancel();
      surfaceAnimationRef.current?.cancel();
      animationRef.current = null;
      surfaceAnimationRef.current = null;
      previousColor.current = color;
      Object.assign(capsule.style, { left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`, visibility: "visible" });
      if (!animate || reducedMotion?.matches || !capsule.animate || from.width === 0) return;
      const motion = quickModeMotion(from, to);
      if (color) {
        motion.keyframes[0]!.backgroundColor = fromCapsuleColor;
        motion.keyframes[motion.keyframes.length - 1]!.backgroundColor = color;
      }
      animationRef.current = capsule.animate(motion.keyframes, { duration: motion.duration, easing: "linear" });
      if (surface?.animate && color) {
        surfaceAnimationRef.current = surface.animate([
          { backgroundColor: fromSurfaceColor }, { backgroundColor: color },
        ], { duration: motion.duration, easing: "ease-in-out" });
      }
    }
    position(previousValue.current !== value);
    previousValue.current = value;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => position(false));
    observer?.observe(track);
    const settle = () => position(false);
    // Translation replaces DOM text after render; keep the capsule aligned if labels grow.
    const labels = new MutationObserver(settle);
    labels.observe(track, { subtree: true, characterData: true, childList: true });
    reducedMotion?.addEventListener("change", settle);
    window.addEventListener("resize", settle);
    return () => {
      observer?.disconnect();
      labels.disconnect();
      reducedMotion?.removeEventListener("change", settle);
      window.removeEventListener("resize", settle);
    };
  }, [value, locale]);

  useLayoutEffect(() => () => {
    animationRef.current?.cancel();
    surfaceAnimationRef.current?.cancel();
  }, []);

  return <div ref={trackRef} className="quick-mode-switch" data-quick-mode={value} role="radiogroup" aria-label="记工模式">
    <span ref={capsuleRef} className="quick-mode-switch__capsule" aria-hidden="true" />
    {modes.map((mode, index) => <button key={mode.value} type="button" role="radio"
      className="quick-mode-switch__option" aria-checked={value === mode.value}
      tabIndex={value === mode.value ? 0 : -1} disabled={disabled}
      onClick={() => onChange(mode.value)}
      onKeyDown={(event) => {
        if (disabled) return;
        const next = event.key === "Home" ? 0 : event.key === "End" ? modes.length - 1
          : event.key === "ArrowRight" || event.key === "ArrowDown" ? (index + 1) % modes.length
          : event.key === "ArrowLeft" || event.key === "ArrowUp" ? (index + modes.length - 1) % modes.length : null;
        if (next === null) return;
        event.preventDefault();
        onChange(modes[next]!.value);
        trackRef.current?.querySelectorAll<HTMLButtonElement>('button[role="radio"]')[next]?.focus();
      }}>
      {mode.value === "HIGHLIGHTED" && <span aria-hidden="true">★</span>}
      <span className="quick-mode-switch__label">{mode.label}</span>
    </button>)}
  </div>;
}
