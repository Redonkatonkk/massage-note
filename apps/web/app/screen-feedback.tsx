"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Feedback {
  id: number;
  text: string;
  tone: "success" | "error";
}

/** Transient board feedback stays outside document flow and never takes focus. */
export function useScreenFeedback() {
  const [message, setMessage] = useState<Feedback | null>(null);
  const [leaving, setLeaving] = useState(false);
  const sequence = useRef(0);
  const show = useCallback((text: string, tone: Feedback["tone"]) => {
    setLeaving(false);
    setMessage(text ? { id: ++sequence.current, text, tone } : null);
  }, []);
  const setNotice = useCallback((text: string) => show(text, "success"), [show]);
  const setError = useCallback((text: string) => show(text, "error"), [show]);

  useEffect(() => {
    if (!message) return;
    const fade = window.setTimeout(() => setLeaving(true), 2000);
    const dismiss = window.setTimeout(() => setMessage(null), 2200);
    return () => { window.clearTimeout(fade); window.clearTimeout(dismiss); };
  }, [message]);

  const feedback = message ? createPortal(
    <div className={`screen-feedback screen-feedback--${message.tone}${leaving ? " is-leaving" : ""}`} key={message.id}
      role={message.tone === "error" ? "alert" : "status"} aria-atomic="true">
      {message.tone === "success" && <span aria-hidden="true">✓ </span>}{message.text}
    </div>, document.body,
  ) : null;
  return { feedback, setNotice, setError };
}
