"use client";

import { useEffect, useState } from "react";
import { useAutoDismissState } from "./use-auto-dismiss-state";

export function NetworkStatus() {
  const [online, setOnline] = useState(true);
  const [recovered, setRecovered] = useAutoDismissState(false);

  useEffect(() => {
    let wasOffline = !navigator.onLine;
    setOnline(!wasOffline);
    const onlineHandler = () => {
      if (wasOffline) setRecovered(true);
      wasOffline = false;
      setOnline(true);
    };
    const offlineHandler = () => { wasOffline = true; setRecovered(false); setOnline(false); };
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);

    // Remove registrations and caches left by releases that supported browser installation.
    if ("serviceWorker" in navigator) {
      void navigator.serviceWorker.getRegistrations().then((registrations) =>
        Promise.all(
          registrations.map((registration) => {
            const worker = registration.active ?? registration.waiting ?? registration.installing;
            return worker && new URL(worker.scriptURL).pathname === "/sw.js"
              ? registration.unregister()
              : false;
          }),
        ),
      );
    }
    if ("caches" in window) {
      void caches.keys().then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith("massage-note-v")).map((key) => caches.delete(key))),
      );
    }

    return () => {
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
    };
  }, [setRecovered]);

  return online && !recovered ? null : (
    <div className={`offline-banner network-notice${online ? " network-notice--online" : ""}`} role="status">
      {online ? "网络已恢复，可以继续操作。" : "网络已断开。当前不能新增、修改或结算；请保留本页，联网后再提交。"}
    </div>
  );
}
