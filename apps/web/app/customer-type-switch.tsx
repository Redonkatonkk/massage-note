"use client";

import { useLayoutEffect, useRef } from "react";
import type { WorkRecordCustomerType } from "../lib/types";
import { quickModeMotion, type CapsuleBounds } from "../lib/quick-mode-motion";
import { useLanguage } from "./language-provider";

const options = [{ value: "NEW", label: "新客" }, { value: "RETURNING", label: "老客" }] as const;

export function CustomerTypeSwitch({ value, onChange, disabled = false }: {
  value: WorkRecordCustomerType | null;
  onChange: (value: WorkRecordCustomerType | null) => void;
  disabled?: boolean;
}) {
  const { locale } = useLanguage();
  const trackRef = useRef<HTMLDivElement>(null);
  const capsuleRef = useRef<HTMLSpanElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const previousValue = useRef(value);
  useLayoutEffect(() => {
    const track = trackRef.current!;
    const capsule = capsuleRef.current!;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    function position(animate: boolean) {
      const selected = track.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!selected) {
        animationRef.current?.cancel(); animationRef.current = null;
        capsule.style.visibility = "hidden";
        return;
      }
      const origin = track.getBoundingClientRect();
      const relative = (rect: DOMRect): CapsuleBounds => ({ left: rect.left - origin.left, top: rect.top - origin.top, width: rect.width, height: rect.height });
      const from = relative(capsule.getBoundingClientRect());
      const to = relative(selected.getBoundingClientRect());
      if (!animate && !reduced?.matches && capsule.style.visibility === "visible" && capsule.style.left === `${to.left}px`
        && capsule.style.top === `${to.top}px` && capsule.style.width === `${to.width}px` && capsule.style.height === `${to.height}px`) return;
      animationRef.current?.cancel(); animationRef.current = null;
      const wasVisible = capsule.style.visibility === "visible";
      Object.assign(capsule.style, { ...Object.fromEntries(Object.entries(to).map(([key, number]) => [key, `${number}px`])), visibility: "visible" });
      if (animate && wasVisible && !reduced?.matches && capsule.animate && from.width > 0) {
        const motion = quickModeMotion(from, to);
        animationRef.current = capsule.animate(motion.keyframes, { duration: motion.duration, easing: "linear" });
      }
    }
    position(previousValue.current !== value);
    previousValue.current = value;
    const settle = () => position(false);
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(settle);
    resize?.observe(track);
    const labels = new MutationObserver(settle);
    labels.observe(track, { childList: true, characterData: true, subtree: true });
    window.addEventListener("resize", settle);
    reduced?.addEventListener("change", settle);
    return () => { resize?.disconnect(); labels.disconnect(); window.removeEventListener("resize", settle); reduced?.removeEventListener("change", settle); };
  }, [value, locale]);
  useLayoutEffect(() => () => { animationRef.current?.cancel(); }, []);
  return <div ref={trackRef} className="customer-type-switch" data-customer-type={value ?? "UNMARKED"} role="group" aria-label="客人类型（选填）">
    <span ref={capsuleRef} className="customer-type-switch__capsule" aria-hidden="true" />
    {options.map((option, index) => <button key={option.value} type="button" disabled={disabled} data-customer-type={option.value}
      aria-pressed={value === option.value} onClick={() => onChange(value === option.value ? null : option.value)}
      onKeyDown={event => {
        const next = event.key === "Home" ? 0 : event.key === "End" ? 1
          : ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(event.key) ? 1 - index : null;
        if (next === null || disabled) return;
        event.preventDefault(); onChange(options[next]!.value);
        trackRef.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
      }}>{option.label}</button>)}
  </div>;
}
