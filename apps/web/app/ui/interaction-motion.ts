"use client";

import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

export function allowsMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: no-preference)")?.matches === true;
}

/** Keep a visual copy while the real dialog closes and releases focus immediately. */
export function animateOverlayExit(
  panel: HTMLElement | null | undefined,
  { backdrop = true, x = 0, y = 5, collapse = false }: { backdrop?: boolean; x?: number; y?: number; collapse?: boolean } = {},
) {
  if (!panel?.isConnected || typeof panel.animate !== "function" || !allowsMotion()) return;
  const { x: left, y: top, width, height } = panel.getBoundingClientRect();
  if (!width || !height) return;
  const layer = document.createElement("div");
  layer.className = "motion-overlay-exit";
  layer.inert = true;
  layer.setAttribute("aria-hidden", "true");
  if (backdrop) layer.dataset.backdrop = "";
  const copy = panel.cloneNode(true) as HTMLElement;
  copy.removeAttribute("id");
  copy.removeAttribute("aria-modal");
  copy.querySelectorAll("[id], [autofocus], [name]").forEach(element => {
    element.removeAttribute("id");
    element.removeAttribute("autofocus");
    element.removeAttribute("name");
  });
  let visual = copy;
  if (panel.tagName === "TR") {
    const sourceRow = panel as HTMLTableRowElement;
    const targetRow = copy as HTMLTableRowElement;
    const table = panel.closest("table")?.cloneNode() as HTMLTableElement | undefined;
    if (!table) return;
    table.removeAttribute("id");
    table.style.tableLayout = "fixed";
    table.style.backgroundColor = "var(--surface)";
    Array.from(targetRow.cells).forEach((cell, index) => {
      cell.style.width = `${sourceRow.cells[index]?.getBoundingClientRect().width ?? 0}px`;
    });
    table.createTBody().append(copy);
    visual = table;
  }
  Object.assign(visual.style, {
    position: "fixed", inset: "auto", left: `${left}px`, top: `${top}px`,
    width: `${width}px`, height: `${height}px`, minWidth: "0", minHeight: "0", maxWidth: "none", maxHeight: "none", margin: "0",
    animation: "none", transition: "none", transform: "none", boxSizing: "border-box",
  });
  layer.append(visual);
  document.body.append(layer);
  const originals = [panel, ...panel.querySelectorAll("*")];
  const copies = [copy, ...copy.querySelectorAll("*")];
  originals.forEach((element, index) => {
    const target = copies[index];
    if (target && element.scrollTop) target.scrollTop = element.scrollTop;
    if (target && element.scrollLeft) target.scrollLeft = element.scrollLeft;
    if (element.tagName === "SELECT" && target) (target as HTMLSelectElement).selectedIndex = (element as HTMLSelectElement).selectedIndex;
  });
  visual.animate(collapse
    ? [{ clipPath: "inset(0)" }, { clipPath: "inset(0 0 100% 0)" }]
    : [{ transform: "none" }, { transform: `translate(${x}px, ${y}px)` }], { duration: 140, easing: "ease-out" });
  const fade = layer.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: "ease-out" });
  const timeout = window.setTimeout(() => layer.remove(), 250);
  const finish = () => { window.clearTimeout(timeout); layer.remove(); };
  void fade.finished.then(finish, finish);
  return layer;
}

export function useOverlayExitRef<T extends HTMLElement>(existingRef?: RefObject<T | null>, backdrop = true, x = 0, y = 5) {
  const current = useRef<T | null>(null);
  return useCallback((element: T | null) => {
    const previous = current.current;
    if (previous && previous !== element && !previous.hasAttribute("data-motion-skip-exit")) {
      const layer = animateOverlayExit(previous, { backdrop, x, y });
      // Strict Mode can detach and reattach the ref without removing the live panel.
      if (layer) queueMicrotask(() => { if (previous.isConnected) layer.remove(); });
    }
    current.current = element;
    if (existingRef) existingRef.current = element;
  }, [existingRef, backdrop, x, y]);
}

/** Read live layout for the selected button, including wrapped and translated labels. */
export function useSelectionIndicator<T extends HTMLElement>(value: string) {
  const ref = useRef<T | null>(null);
  const align = useCallback(() => {
    const group = ref.current;
    if (!group) return;
    const buttons = group.querySelectorAll<HTMLElement>('[aria-pressed="true"]');
    const selected = buttons.length === 1 ? buttons[0] : null;
    if (!selected?.offsetWidth) { delete group.dataset.motionSelection; return; }
    group.style.setProperty("--selection-x", `${selected.offsetLeft}px`);
    group.style.setProperty("--selection-y", `${selected.offsetTop}px`);
    group.style.setProperty("--selection-width", `${selected.offsetWidth}px`);
    group.style.setProperty("--selection-height", `${selected.offsetHeight}px`);
    group.dataset.motionSelection = "";
  }, []);
  const attach = useCallback((group: T | null) => {
    ref.current = group;
    if (!group) return;
    align();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(align);
    observer?.observe(group);
    for (const button of group.children) observer?.observe(button);
    return () => { observer?.disconnect(); ref.current = null; };
  }, [align]);
  useLayoutEffect(align, [align, value]);
  return attach;
}

/** Reveal committed data in place without resetting controls or replaying on polling. */
export function useContentMotion<T extends HTMLElement>(revision: unknown, marks?: string) {
  const ref = useRef<T | null>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !allowsMotion() || typeof node.animate !== "function") return;
    const targets = marks ? Array.from(node.querySelectorAll(marks)) : [node];
    const effects = targets.map(target => target.animate([{ opacity: .72 }, { opacity: 1 }],
      { duration: 210, easing: "cubic-bezier(.22, 1, .36, 1)" }));
    return () => { for (const effect of effects) effect.cancel(); };
  }, [revision, marks]);
  return ref;
}

export function scrollConversationToEnd(messages: HTMLDivElement | null) {
  if (!messages) return;
  if (typeof messages.scrollTo === "function") messages.scrollTo({ top: messages.scrollHeight, behavior: allowsMotion() ? "smooth" : "instant" });
  else messages.scrollTop = messages.scrollHeight;
}

export async function withButtonMotion(button: HTMLButtonElement, run: () => Promise<void>) {
  button.dataset.motionBusy = "true";
  try { await run(); }
  finally { delete button.dataset.motionBusy; }
}

/** Measure only while a panel's layout can change and keep its top edge fixed. */
export function usePanelHeight(panel: RefObject<HTMLElement | null>, open: boolean, sizeKey: unknown) {
  const height = useRef(0);
  const animation = useRef<Animation | null>(null);
  useLayoutEffect(() => {
    const element = panel.current;
    if (!open || !element || !allowsMotion() || typeof ResizeObserver === "undefined" || typeof element.animate !== "function") return;
    height.current = element.offsetHeight;
    const observer = new ResizeObserver(() => {
      if (animation.current?.playState !== "running") height.current = element.offsetHeight;
    });
    observer.observe(element);
    return () => { observer.disconnect(); animation.current?.cancel(); animation.current = null; height.current = 0; };
  }, [open, panel]);
  useLayoutEffect(() => {
    const element = panel.current;
    if (!open || !element || !allowsMotion() || typeof element.animate !== "function") return;
    const from = animation.current?.playState === "running" ? element.offsetHeight : height.current;
    animation.current?.cancel();
    const to = element.offsetHeight;
    height.current = to;
    if (from && to && Math.abs(from - to) > 1) {
      animation.current = element.animate([{ height: `${from}px` }, { height: `${to}px` }],
        { duration: 180, easing: "cubic-bezier(.22, 1, .36, 1)" });
    }
  }, [open, panel, sizeKey]);
}

/** Animate surviving keyed items from their last measured positions. */
export function useListMotion<T extends HTMLElement>(keys: string, enabled = true) {
  const root = useRef<T | null>(null);
  const positions = useRef(new Map<string, { x: number; y: number }>());
  const animations = useRef(new Map<HTMLElement, Animation>());
  const measured = useRef(false);
  useLayoutEffect(() => {
    const container = root.current;
    if (!container || !enabled || !allowsMotion()) {
      positions.current.clear();
      measured.current = false;
      return;
    }
    for (const [item, animation] of animations.current) {
      if (!container.contains(item)) { animation.cancel(); animations.current.delete(item); }
    }
    const next = new Map<string, { x: number; y: number }>();
    const containerRect = container.getBoundingClientRect();
    for (const item of container.querySelectorAll<HTMLElement>("[data-motion-item]")) {
      if (item.closest("[data-motion-list]") !== container) continue;
      const id = item.dataset.motionItem!;
      const prior = positions.current.get(id);
      animations.current.get(item)?.cancel();
      const rect = item.getBoundingClientRect();
      const x = rect.left - containerRect.left + container.scrollLeft;
      const y = rect.top - containerRect.top + container.scrollTop;
      if (!(rect.width && rect.height)) continue;
      next.set(id, { x, y });
      if (typeof item.animate !== "function") continue;
      if (!prior) {
        if (measured.current && !item.hasAttribute("data-motion-skip-in")) {
          item.animate([{ opacity: .7 }, { opacity: 1 }], { duration: 180, easing: "ease-out" });
        }
        continue;
      }
      const dx = prior.x - x;
      const dy = prior.y - y;
      if (Math.abs(dx) + Math.abs(dy) < 1) continue;
      const motion = item.animate([{ translate: `${dx}px ${dy}px` }, { translate: "0px 0px" }],
        { duration: 190, easing: "cubic-bezier(.22, 1, .36, 1)" });
      animations.current.set(item, motion);
      void motion.finished.then(() => {
        if (animations.current.get(item) === motion) animations.current.delete(item);
      }, () => undefined);
    }
    positions.current = next;
    measured.current = Boolean(containerRect.width);
  }, [enabled, keys]);
  useLayoutEffect(() => () => {
    for (const animation of animations.current.values()) animation.cancel();
    animations.current.clear();
    positions.current.clear();
    measured.current = false;
  }, []);
  return root;
}
