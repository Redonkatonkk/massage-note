"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createFeedbackTimer } from "../lib/feedback-timer";

// The initial value is the empty feedback state ("", false or null).
export function useAutoDismissState<T>(initialValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initialValue);
  const mounted = useRef(true);
  const timer = useMemo(() => createFeedbackTimer(() => setValue(initialValue)), [initialValue]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; timer.cancel(); };
  }, [timer]);

  const update = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    if (!mounted.current) return;
    setValue(next);
    // Reset even when the same message is triggered again.
    if (next === initialValue) timer.cancel();
    else timer.restart();
  }, [initialValue, timer]);

  return [value, update];
}
