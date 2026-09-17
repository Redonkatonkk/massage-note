/** One connection per store per browser page. No account-level deduplication. */
export type RealtimeState = "连接中" | "已同步" | "网络已断开";
export interface StoreChange { entityType: string; businessDate?: string | null }
export interface RealtimeChange { full: boolean; changes: StoreChange[] }
export const fullResync = (): RealtimeChange => ({ full: true, changes: [] });

type Listener = {
  refresh: (change: RealtimeChange) => void | Promise<void>;
  state: (state: RealtimeState) => void;
  pending: RealtimeChange | undefined;
  running: boolean;
  loaded: boolean;
};

export function createStoreChannel(url: string) {
  const listeners = new Set<Listener>();
  let source: EventSource | undefined;
  let debounce: ReturnType<typeof setTimeout> | undefined;
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastMessage = 0;
  let lastFallback = 0;
  let healthy = false;
  let degraded = false;
  let generation = 0;
  const enabled = () => navigator.onLine && document.visibilityState !== "hidden";
  const publish = () => listeners.forEach(listener => listener.state(
    !navigator.onLine ? "网络已断开" : healthy && listener.loaded && !listener.pending ? "已同步" : "连接中",
  ));

  async function drain(listener: Listener) {
    if (listener.running || !enabled() || !listeners.has(listener)) return;
    listener.running = true;
    try {
      while (listener.pending && enabled() && listeners.has(listener)) {
        const change = listener.pending;
        listener.pending = undefined;
        listener.loaded = false;
        const current = generation;
        try {
          await listener.refresh(change);
          if (current === generation) listener.loaded = true;
        } catch {
          listener.loaded = false;
          // Retry failed REST reads even when SSE itself is still healthy.
        }
        publish();
      }
    } finally { listener.running = false; }
  }

  function schedule(change: RealtimeChange) {
    for (const listener of listeners) {
      listener.loaded = false;
      listener.pending = listener.pending?.full || change.full || (listener.pending?.changes.length ?? 0) + change.changes.length > 100 ? fullResync() : {
        full: false,
        changes: [...(listener.pending?.changes ?? []), ...change.changes],
      };
    }
    publish();
    // A bounded coalescing window cannot be starved by continuous writes.
    if (!debounce && enabled()) debounce = setTimeout(() => {
      debounce = undefined;
      listeners.forEach(listener => { void drain(listener); });
    }, 250);
  }

  function close() {
    generation++;
    source?.close();
    source = undefined;
    healthy = false;
    if (debounce) clearTimeout(debounce);
    debounce = undefined;
    publish();
  }

  function connect() {
    if (source || !enabled()) return;
    lastMessage = Date.now();
    const connection = new EventSource(url, { withCredentials: true });
    source = connection;
    const received = () => {
      if (source !== connection) return false;
      lastMessage = Date.now();
      healthy = true;
      degraded = false;
      return true;
    };
    // Opening HTTP alone does not prove that the proxy is delivering events.
    connection.onopen = () => { if (source === connection) schedule(fullResync()); };
    connection.addEventListener("heartbeat", () => { if (received()) publish(); });
    connection.addEventListener("store.changed", event => {
      if (!received()) return;
      let change = fullResync();
      try {
        const data = JSON.parse((event as MessageEvent<string>).data) as Record<string, unknown>;
        if (typeof data.entityType === "string" && !data.reason) change = {
          full: false,
          changes: [{ entityType: data.entityType, businessDate: typeof data.businessDate === "string" ? data.businessDate : null }],
        };
      } catch { /* Unknown notifications conservatively invalidate all data. */ }
      schedule(change);
    });
    connection.onerror = () => {
      if (source !== connection) return;
      healthy = false;
      if (!degraded) { degraded = true; lastFallback = Date.now(); schedule(fullResync()); }
      publish();
    };
  }

  function resume() {
    if (!enabled()) { close(); return; }
    if (!source) {
      connect();
      lastFallback = Date.now();
      schedule(fullResync());
    }
  }
  function pageShow(event: PageTransitionEvent) {
    if (event.persisted) { close(); resume(); }
  }
  function tick() {
    if (!enabled()) return;
    if (source && Date.now() - lastMessage >= 10_000) {
      close();
      if (!degraded) { degraded = true; lastFallback = Date.now(); schedule(fullResync()); }
      connect();
    }
    if (Date.now() - lastFallback >= 30_000 && (!healthy || [...listeners].some(listener => !listener.loaded))) {
      lastFallback = Date.now();
      schedule(fullResync());
    }
  }

  return {
    subscribe(refresh: Listener["refresh"], state: Listener["state"]) {
      const listener: Listener = { refresh, state, running: false, loaded: false, pending: fullResync() };
      listeners.add(listener);
      if (listeners.size === 1) {
        window.addEventListener("online", resume);
        window.addEventListener("offline", resume);
        window.addEventListener("pageshow", pageShow);
        document.addEventListener("visibilitychange", resume);
        timer = setInterval(tick, 1_000);
        resume();
      } else { schedule(fullResync()); }
      publish();
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          close();
          clearInterval(timer);
          window.removeEventListener("online", resume);
          window.removeEventListener("offline", resume);
          window.removeEventListener("pageshow", pageShow);
          document.removeEventListener("visibilitychange", resume);
        }
      };
    },
  };
}
