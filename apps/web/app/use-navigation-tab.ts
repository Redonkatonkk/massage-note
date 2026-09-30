"use client";

import { useCallback, useEffect, type Dispatch, type SetStateAction } from "react";
import type { NavigationRole } from "../lib/app-navigation";

export function useNavigationTab<T extends string>(role: NavigationRole | undefined, resolve: (value: string | null, role: NavigationRole) => T, setTab: Dispatch<SetStateAction<T>>) {
  useEffect(() => {
    if (!role) return;
    const read = () => setTab(resolve(new URL(window.location.href).searchParams.get("tab"), role));
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, [role, resolve, setTab]);

  return useCallback((value: string) => {
    if (!role) return;
    const next = resolve(value, role);
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }, [role, resolve, setTab]);
}
