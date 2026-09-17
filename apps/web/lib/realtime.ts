"use client";

import { useEffect, useRef, useState } from "react";
import { apiBase } from "./api";
import { createStoreChannel, type RealtimeChange, type RealtimeState } from "./realtime-client";
export type { RealtimeChange, RealtimeState } from "./realtime-client";

const channels = new Map<string, { channel: ReturnType<typeof createStoreChannel>; subscribers: number }>();

export function useStoreRealtime(storeId: string | undefined, onChange: (change: RealtimeChange) => void | Promise<void>) {
  const handler = useRef(onChange);
  const [state, setState] = useState<RealtimeState>("连接中");
  useEffect(() => { handler.current = onChange; }, [onChange]);
  useEffect(() => {
    if (!storeId) return;
    let entry = channels.get(storeId);
    if (!entry) {
      entry = { channel: createStoreChannel(`${apiBase}/stores/${storeId}/events`), subscribers: 0 };
      channels.set(storeId, entry);
    }
    entry.subscribers++;
    const unsubscribe = entry.channel.subscribe(change => handler.current(change), setState);
    return () => {
      unsubscribe();
      if (--entry.subscribers === 0) channels.delete(storeId);
    };
  }, [storeId]);
  return state;
}
