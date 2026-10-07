import type { ReactNode } from "react";

export type IconName = "log" | "chart" | "store" | "user" | "arrow" | "gift" | "discount" | "wallet" | "trend" | "clock" | "check" | "sparkles" | "help" | "plus" | "walk-in";

const iconPaths: Record<IconName, ReactNode> = {
  log: <><rect x="5" y="4" width="14" height="17" rx="3" /><path d="M9 4V2m6 2V2M9 10h6m-6 4h4" /></>,
  chart: <><path d="M4 3v17h17M8 15v-4m5 4V7m5 8V4" /></>,
  store: <><path d="m3 9 2-6h14l2 6M5 13v8h14v-8M9 21v-6h6v6" /><path d="M3 9v1a3 3 0 0 0 6 0V9m0 0v1a3 3 0 0 0 6 0V9m0 0v1a3 3 0 0 0 6 0V9" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
  arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
  gift: <><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M5 12v9h14v-9M12 8v13" /><path d="M12 8H8a2.5 2.5 0 1 1 2.4-3.2L12 8Zm0 0h4a2.5 2.5 0 1 0-2.4-3.2L12 8Z" /></>,
  discount: <><path d="m4 4 6-1 11 11-7 7L3 10l1-6Z" /><circle cx="7.5" cy="7.5" r=".5" /></>,
  wallet: <><path d="M20 8V5a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v12H6a3 3 0 0 1-3-3V6" /><path d="M20 12h-5v5h5m-3-2.5h.1" /></>,
  trend: <><path d="m3 17 6-6 4 4 8-10m-6 0h6v6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  sparkles: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z" /><path d="M20 2v4m-2-2h4" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 4.5 1.5c-1 .6-2 1-2 2.5m0 3h.01" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  "walk-in": <><circle cx="13" cy="4" r="2" /><path d="m7 21 3-6m6 6-2-5-3-3 1-5m-5 6V9l5-1 4 4h4" /></>,
};

export function UiIcon({ name, className = "" }: { name: IconName; className?: string }) {
  return <svg className={`ui-icon ${className}`.trim()} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{iconPaths[name]}</svg>;
}

export function BrandMark() {
  return <svg className="brand-mark" width="42" height="42" viewBox="0 0 42 42" fill="none" aria-hidden="true" focusable="false"><rect width="42" height="42" rx="14" fill="currentColor" /><path d="M11 28V14l10 10 10-10v14" stroke="var(--surface)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M21 10v3" stroke="var(--surface)" strokeWidth="2.5" strokeLinecap="round" /></svg>;
}

export function OverviewMetric({ label, value, icon, title }: { label: string; value: string; icon: IconName; title?: string }) {
  return <div className="overview-metric" title={title}><span className="overview-metric__label"><UiIcon name={icon} />{label}</span><strong>{value}</strong></div>;
}
