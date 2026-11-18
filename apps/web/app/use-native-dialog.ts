"use client";

import { useCallback, useRef } from "react";
import { animateOverlayExit } from "./ui/interaction-motion";

/** Release native modal state while the element is still connected. */
export function useNativeDialog(exitOnUnmount = false) {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const dialogRef = useCallback((element: HTMLDialogElement | null) => {
    const previous = dialog.current;
    if (previous !== element && previous?.open) {
      const layer = exitOnUnmount && !previous.hasAttribute("data-motion-skip-exit")
        ? animateOverlayExit(previous, previous.classList.contains("member-sheet") ? { x: 12, y: 0 } : undefined)
        : undefined;
      previous.close();
      if (layer) queueMicrotask(() => { if (previous.isConnected) layer.remove(); });
    }
    dialog.current = element;
  }, [exitOnUnmount]);
  const close = useCallback(() => {
    const element = dialog.current;
    if (!element?.open) return;
    if (!window.CSS?.supports?.("(transition-behavior: allow-discrete) and (overlay: auto)")) {
      animateOverlayExit(element, element.classList.contains("workspace-menu") ? { x: -12, y: 0 } : undefined);
    }
    element.close();
  }, []);
  return [dialog, dialogRef, close] as const;
}
