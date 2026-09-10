"use client";

import { useLayoutEffect, useRef, useState } from "react";

type AppNavPage = "today" | "finance" | "manage" | "profile";

export function AppNav({ active, storeId }: { active: AppNavPage; storeId?: string | undefined }) {
  const navRef = useRef<HTMLElement>(null);
  const [navHeight, setNavHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => setNavHeight(Math.ceil(nav.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    return () => observer.disconnect();
  }, []);

  const storeQuery = storeId ? `?store=${encodeURIComponent(storeId)}` : "";
  const items: Array<{ page: AppNavPage; href: string; icon: string; label: string }> = [
    { page: "today", href: "/", icon: "今", label: "今日" },
    { page: "finance", href: `/finance${storeQuery}`, icon: "账", label: "财务" },
    { page: "manage", href: `/manage${storeQuery}`, icon: "店", label: "店铺设置" },
    { page: "profile", href: "/profile", icon: "我", label: "我的" },
  ];
  return (
    <div className="app-nav-space" style={{ height: navHeight ?? undefined }}>
    <nav ref={navRef} className="bottom-nav" aria-label="主要导航">
      {items.map((item) => <a key={item.page} className={`bottom-nav__item${active === item.page ? " bottom-nav__item--active" : ""}`} href={item.href}><span aria-hidden="true">{item.icon}</span>{item.label}</a>)}
    </nav>
    </div>
  );
}
