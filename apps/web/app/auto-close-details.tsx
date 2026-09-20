"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export function AutoCloseDetails({ className, children }: { className: string; children: ReactNode }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const timeout = window.setTimeout(() => {
      const details = detailsRef.current;
      if (!details) return;
      if (details.contains(document.activeElement)) details.querySelector("summary")?.focus();
      details.open = false;
      setOpen(false);
    }, 10_000);
    return () => window.clearTimeout(timeout);
  }, [open]);

  return <details ref={detailsRef} className={className} onToggle={(event) => setOpen(event.currentTarget.open)}>{children}</details>;
}
