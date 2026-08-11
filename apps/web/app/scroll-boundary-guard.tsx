"use client";

import { useEffect } from "react";

function canScrollVertically(target: EventTarget | null, deltaY: number): boolean {
  let element = target instanceof Element ? target : null;

  while (element) {
    const style = window.getComputedStyle(element);
    const isScrollable =
      /(auto|scroll)/.test(style.overflowY) &&
      element.scrollHeight > element.clientHeight + 1;

    if (isScrollable) {
      const atTop = element.scrollTop <= 0;
      const atBottom =
        element.scrollTop + element.clientHeight >= element.scrollHeight - 1;

      if ((deltaY > 0 && !atTop) || (deltaY < 0 && !atBottom)) {
        return true;
      }

      if (/^(contain|none)$/.test(style.overscrollBehaviorY)) {
        return false;
      }
    }

    element = element.parentElement;
  }

  return false;
}

export function ScrollBoundaryGuard() {
  useEffect(() => {
    let startX = 0;
    let startY = 0;

    const onTouchStart = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      startX = event.touches[0]!.clientX;
      startY = event.touches[0]!.clientY;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!event.cancelable || event.touches.length !== 1) return;

      const deltaX = event.touches[0]!.clientX - startX;
      const deltaY = event.touches[0]!.clientY - startY;
      if (Math.abs(deltaY) <= Math.abs(deltaX)) return;

      if (!canScrollVertically(event.target, deltaY)) {
        event.preventDefault();
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  return null;
}
