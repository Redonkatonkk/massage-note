"use client";

import { useEffect, useRef, useState } from "react";
import { apiBase } from "./api";

export type RealtimeState = "连接中" | "已同步" | "网络已断开";

export function useStoreRealtime(storeId: string | undefined, onChange: () => void | Promise<void>) {
  const handler = useRef(onChange);
  const [state, setState] = useState<RealtimeState>("连接中");
  useEffect(() => { handler.current = onChange; }, [onChange]);
  useEffect(() => {
    if (!storeId) return;
    setState("连接中");
    let active = true;
    let debounce: ReturnType<typeof setTimeout> | undefined;
    const events = new EventSource(`${apiBase}/stores/${storeId}/events`, { withCredentials: true });
    const refresh = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(() => { void Promise.resolve().then(() => handler.current()).then(() => { if (active && events.readyState === EventSource.OPEN) setState("已同步"); }).catch(() => { if (active) setState("连接中"); }); }, 250);
    };
    events.onopen = () => { setState("已同步"); refresh(); };
    events.onerror = () => setState(navigator.onLine ? "连接中" : "网络已断开");
    events.addEventListener("store.changed", refresh);
    const offline = () => setState("网络已断开");
    const online = () => setState("连接中");
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      active = false;
      if (debounce) clearTimeout(debounce);
      events.close();
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
    };
  }, [storeId]);
  return state;
}
