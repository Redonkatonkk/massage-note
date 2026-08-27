"use client";

import { useEffect, useState } from "react";

export function NetworkStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    setOnline(navigator.onLine);

    const onlineHandler = () => setOnline(true);
    const offlineHandler = () => setOnline(false);
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
  }, []);

  return online ? null : (
    <div className="offline-banner" role="status">
      网络已断开。当前不能新增、修改或结算；请保留本页，联网后再提交。
    </div>
  );
}
