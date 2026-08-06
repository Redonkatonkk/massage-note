type AppNavPage = "today" | "finance" | "manage" | "profile";

export function AppNav({ active, storeId }: { active: AppNavPage; storeId?: string | undefined }) {
  const storeQuery = storeId ? `?store=${encodeURIComponent(storeId)}` : "";
  const items: Array<{ page: AppNavPage; href: string; icon: string; label: string }> = [
    { page: "today", href: "/", icon: "今", label: "今日" },
    { page: "finance", href: `/finance${storeQuery}`, icon: "账", label: "财务" },
    { page: "manage", href: `/manage${storeQuery}`, icon: "店", label: "店铺设置" },
    { page: "profile", href: "/profile", icon: "我", label: "我的" },
  ];
  return (
    <nav className="bottom-nav" aria-label="主要导航">
      {items.map((item) => <a key={item.page} className={`bottom-nav__item${active === item.page ? " bottom-nav__item--active" : ""}`} href={item.href}><span aria-hidden="true">{item.icon}</span>{item.label}</a>)}
    </nav>
  );
}
