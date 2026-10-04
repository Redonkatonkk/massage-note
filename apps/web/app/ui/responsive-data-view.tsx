import type { ReactNode } from "react";

/** CSS selects one presentation; data and action handlers stay shared by both views. */
export function ResponsiveDataView({ desktop, children }: { desktop: ReactNode; children: ReactNode }) {
  return <div className="responsive-data-view"><div className="desktop-data-view">{desktop}</div><div className="mobile-data-view">{children}</div></div>;
}

export function MobileDataCard({ title, subtitle, status, actions, children, className = "" }: {
  title: ReactNode; subtitle?: ReactNode; status?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string;
}) {
  return <article className={`mobile-data-card ${className}`.trim()}>
    <header><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div>{status && <div className="mobile-data-card__status">{status}</div>}</header>
    {children}
    {actions && <footer className="mobile-data-card__actions">{actions}</footer>}
  </article>;
}

export function RecordFacts({ items }: { items: Array<{ label: string; value: ReactNode; wide?: boolean }> }) {
  return <dl className="record-facts">{items.map(({ label, value, wide }) => <div key={label} className={wide ? "is-wide" : undefined}><dt>{label}</dt><dd>{value ?? "—"}</dd></div>)}</dl>;
}
