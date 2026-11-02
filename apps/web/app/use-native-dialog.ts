"use client";

import { useCallback, useRef } from "react";

/** Release native modal state while the element is still connected. */
export function useNativeDialog() {
  const dialog = useRef<HTMLDialogElement | null>(null);
  const dialogRef = useCallback((element: HTMLDialogElement | null) => {
    if (dialog.current !== element && dialog.current?.open) dialog.current.close();
    dialog.current = element;
  }, []);
  return [dialog, dialogRef] as const;
}
