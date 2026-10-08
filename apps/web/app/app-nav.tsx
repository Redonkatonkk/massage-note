"use client";

import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { BrandMark, UiIcon, type IconName } from "./ui/primitives";
import { LanguageSwitcher } from "./language-provider";
import { financeNavigationTabs, manageNavigationTabs, navigationTabHref, type AppNavPage, type NavigationRole } from "../lib/app-navigation";

export function AppNav({ active, storeId, role = "EMPLOYEE", activeTab, onTabChange, assistant }: { active: AppNavPage; storeId?: string | undefined; role?: NavigationRole | undefined; activeTab?: string | undefined; onTabChange?: ((value: string) => void) | undefined; assistant?: ReactNode }) {
  const navRef = useRef<HTMLElement>(null);
  const submenuId = useId();
  const [expandedGroups, setExpandedGroups] = useState<Partial<Record<AppNavPage, boolean>>>({});
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
  const items: Array<{ page: AppNavPage; href: string; icon: IconName; label: string }> = [
    { page: "today", href: "/", icon: "log", label: "记工" },
    { page: "finance", href: `/finance${storeQuery}`, icon: "chart", label: "财务" },
    { page: "manage", href: `/manage${storeQuery}`, icon: "store", label: "店铺设置" },
    { page: "profile", href: "/profile", icon: "user", label: "我的" },
  ];
  return <div className="app-nav-space" style={{ "--app-nav-height": navHeight === null ? undefined : `${navHeight}px` } as CSSProperties}>
    <nav ref={navRef} className="bottom-nav" aria-label="主要导航">
      <a className="app-nav-brand" href="/" aria-label="Massage note 首页"><BrandMark /><span>massage<span className="app-nav-brand__note">note.</span></span></a>
      <p className="app-nav-caption">店铺工作台</p>
      <div className={`app-nav-links${assistant ? " app-nav-links--with-ai" : ""}`}>{items.map((item) => {
        const children = item.page === "finance" ? financeNavigationTabs(role) : item.page === "manage" ? manageNavigationTabs(role) : [];
        const isActive = active === item.page;
        const hasChildren = children.length > 0;
        const isExpanded = expandedGroups[item.page] ?? false;
        const itemClassName = `bottom-nav__item${isActive ? " bottom-nav__item--active" : ""}`;
        return <div className="app-nav-group" key={item.page}>
          <a aria-label={item.label} aria-current={isActive ? "page" : undefined} className={`${itemClassName}${hasChildren ? " app-nav-parent-link" : ""}`} href={item.href}><UiIcon name={item.icon} /><span className="app-nav-label">{item.label}</span></a>
          {hasChildren && <button type="button" aria-label={item.label} aria-current={isActive ? "page" : undefined} aria-expanded={isExpanded} aria-controls={`${submenuId}-${item.page}`} className={`${itemClassName} app-nav-toggle`} onClick={() => setExpandedGroups(groups => ({ ...groups, [item.page]: !groups[item.page] }))}><UiIcon name={item.icon} /><span className="app-nav-label">{item.label}</span><UiIcon name="arrow" className="app-nav-toggle__arrow" /></button>}
          {hasChildren && (item.page === "finance" || item.page === "manage") && <div id={`${submenuId}-${item.page}`} className="app-nav-submenu" hidden={!isExpanded}>
            {children.map(([value, label]) => <a key={value} href={navigationTabHref(item.page as "finance" | "manage", value, storeId)} aria-current={isActive && activeTab === value ? "page" : undefined} onClick={event => {
              if (isActive && onTabChange && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                event.preventDefault(); onTabChange(value);
              }
            }}>{label}</a>)}
          </div>}
        </div>;
      })}{assistant && <div className="app-nav-group">{assistant}</div>}</div>
      <div className="app-nav-footer"><LanguageSwitcher /><a href="/help" aria-label="使用帮助"><UiIcon name="help" /><span className="app-nav-label">使用帮助</span><UiIcon name="arrow" className="app-nav-footer__arrow" /></a><span className="app-nav-version">Massage note</span></div>
    </nav>
  </div>;
}
