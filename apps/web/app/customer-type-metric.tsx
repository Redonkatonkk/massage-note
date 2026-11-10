"use client";

import type { CustomerTypeCounts } from "../lib/types";

export function CustomerTypeMetric({ counts }: { counts: CustomerTypeCounts }) {
  const total = counts.newCount + counts.returningCount + counts.unmarkedCount;
  const parts = [
    { label: "新客", count: counts.newCount, color: "var(--brand)" },
    { label: "老客", count: counts.returningCount, color: "var(--muted)" },
    { label: "未标记", count: counts.unmarkedCount, color: "var(--line)" },
  ];
  let offset = 0;
  return <div className="overview-metric customer-type-metric">
    <span className="overview-metric__label">新老客占比</span>
    <div className="customer-type-metric__body">
      <svg viewBox="0 0 80 80" aria-hidden="true">
        {total === 0 ? <circle cx="40" cy="40" r="38" fill="var(--surface-soft)" stroke="var(--line)" /> : parts.map(part => {
          if (!part.count) return null;
          const fraction = part.count / total;
          const start = offset * Math.PI * 2 - Math.PI / 2;
          offset += fraction;
          const end = offset * Math.PI * 2 - Math.PI / 2;
          return fraction === 1 ? <circle key={part.label} cx="40" cy="40" r="38" fill={part.color} />
            : <path key={part.label} fill={part.color} d={`M40 40 L${40 + 38 * Math.cos(start)} ${40 + 38 * Math.sin(start)} A38 38 0 ${fraction > 0.5 ? 1 : 0} 1 ${40 + 38 * Math.cos(end)} ${40 + 38 * Math.sin(end)} Z`} />;
        })}
      </svg>
      {total === 0 ? <span className="customer-type-metric__empty">暂无记工</span> : <dl>
        {parts.map(part => <div key={part.label}><dt><i style={{ backgroundColor: part.color }} aria-hidden="true" />{part.label}</dt><dd><span>{part.count}</span><span>{(part.count / total * 100).toFixed(1)}%</span></dd></div>)}
      </dl>}
    </div>
  </div>;
}
