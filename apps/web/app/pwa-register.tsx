"use client";

import { useEffect, useState } from "react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function PwaRegister() {
  const [online, setOnline] = useState(true);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  useEffect(() => {
    setOnline(navigator.onLine);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") void navigator.serviceWorker.register("/sw.js");
    const onlineHandler = () => setOnline(true);
    const offlineHandler = () => setOnline(false);
    const promptHandler = (event: Event) => { event.preventDefault(); setInstallPrompt(event as InstallPromptEvent); };
    window.addEventListener("online", onlineHandler);
    window.addEventListener("offline", offlineHandler);
    window.addEventListener("beforeinstallprompt", promptHandler);
    return () => {
      window.removeEventListener("online", onlineHandler);
      window.removeEventListener("offline", offlineHandler);
      window.removeEventListener("beforeinstallprompt", promptHandler);
    };
  }, []);
  return <>{!online && <div className="offline-banner" role="status">网络已断开。当前不能新增、修改或结算；请保留本页，联网后再提交。</div>}{installPrompt && <button className="install-app-button" type="button" onClick={() => { void installPrompt.prompt().then(() => installPrompt.userChoice).finally(() => setInstallPrompt(null)); }}>安装“Massage note”</button>}</>;
}
