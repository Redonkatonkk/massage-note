"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { BrandMark, UiIcon, type IconName } from "./ui/primitives";
import { financeNavigationTabs, manageNavigationTabs, navigationTabHref, type AppNavPage, type NavigationRole, type FinanceTab, type ManageTab } from "../lib/app-navigation";
import { useLanguage } from "./language-provider";

export function AppNav({ active, storeId, role = "EMPLOYEE", activeTab, onTabChange }: { active: AppNavPage; storeId?: string | undefined; role?: NavigationRole | undefined; activeTab?: string | undefined; onTabChange?: ((value: string) => void) | undefined }) {
  const { t } = useLanguage();
  const navRef = useRef<HTMLElement>(null);
  const [navHeight, setNavHeight] = useState<number | null>(null);
  const [openSections, setOpenSections] = useState<string[]>(active === "finance" || active === "manage" ? [active] : []);

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
  return (
    <div className="app-nav-space" style={{ "--app-nav-height": navHeight === null ? undefined : `${navHeight}px` } as CSSProperties}>
    <nav ref={navRef} className="bottom-nav" aria-label="主要导航" onPointerLeave={event => {
      if (event.pointerType === "mouse" && !event.currentTarget.querySelector(":focus-visible")) setOpenSections([]);
    }}>
      <a className="app-nav-brand" href="/" aria-label="Massage note 首页"><BrandMark /><span>massage<span className="app-nav-brand__note">note.</span></span></a>
      <p className="app-nav-caption">店铺工作台</p>
      <div className="app-nav-links">{items.map((item) => {
        const children: Array<[FinanceTab | ManageTab, string]> = item.page === "finance" ? financeNavigationTabs(role) : item.page === "manage" ? manageNavigationTabs(role) : [];
        const isOpen = openSections.includes(item.page);
        return <div className="app-nav-group" key={item.page} onPointerEnter={event => {
          if (event.pointerType === "mouse" && window.matchMedia("(min-width: 1200px) and (hover: hover)").matches) {
            setOpenSections(children.length > 0 ? [item.page] : []);
          }
        }}>
          <div className="app-nav-row">
            <a aria-current={active === item.page ? "page" : undefined} aria-label={item.label} title={item.label} className={`bottom-nav__item${active === item.page ? " bottom-nav__item--active" : ""}`} href={item.href}><UiIcon name={item.icon} /><span className="app-nav-label">{item.label}</span><span className="app-nav-active-dot" aria-hidden="true" /></a>
            {children.length > 0 && <button className="app-nav-submenu-toggle" type="button" aria-label={`${t(item.label)} · ${t(isOpen ? "收起子菜单" : "展开子菜单")}`} aria-expanded={isOpen} aria-controls={`nav-submenu-${item.page}`} onClick={() => setOpenSections(current => isOpen ? current.filter(page => page !== item.page) : [...current, item.page])}><UiIcon name="arrow" /></button>}
          </div>
          {children.length > 0 && (item.page === "finance" || item.page === "manage") && <div className="app-nav-submenu" id={`nav-submenu-${item.page}`} data-open={isOpen} inert={!isOpen} aria-hidden={!isOpen}>
            <div className="app-nav-submenu__inner"><div className="app-nav-submenu__links">{children.map(([value, label]) => <a key={value} href={navigationTabHref(item.page as "finance" | "manage", value, storeId)} aria-current={active === item.page && activeTab === value ? "page" : undefined} onClick={event => {
              if (active === item.page && onTabChange && event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
                event.preventDefault();
                onTabChange(value);
              }
            }}>{label}</a>)}</div></div>
          </div>}
        </div>;
      })}</div>
      <div className="app-nav-footer"><div className="app-nav-note"><UiIcon name="check" /><p>每一笔，都有条理。<small>Massage note</small></p></div><a href="/help" aria-label="使用帮助" title="使用帮助"><UiIcon name="help" /><span className="app-nav-label">使用帮助</span><UiIcon name="arrow" className="app-nav-footer__arrow" /></a></div>
    </nav>
    </div>
  );
}
