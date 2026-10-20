import type { ChartPoint, ChartSeries } from "./analytics-chart";

export function AnalyticsHorizontalBars({ points, series, width, valueWidth, label, selected, inspect, activate }: {
  points: ChartPoint[]; series: ChartSeries[]; width: number; valueWidth: number;
  label: (value: number | null | undefined) => string; selected: string | null;
  inspect: (point: ChartPoint) => void; activate: (point: ChartPoint) => void;
}) {
  const values = series.flatMap(item => item.values).filter((value): value is number => value != null);
  const min = Math.min(0, ...values), max = Math.max(1, ...values);
  const left = 4, right = Math.max(left + 1, width - valueWidth - 16);
  const x = (value: number) => left + (value - min) / (max - min) * (right - left);
  const height = 32 + series.length * 28;
  // One SVG per category keeps long daily ranges in normal vertical document flow.
  return points.map((point, index) => <svg key={point.label} width="100%" height={height} viewBox={`0 0 ${width} ${height}`} aria-label={point.detail}>
    <text className="analytics-axis-label" x={left} y="18">{point.label}</text>
    {Array.from({ length: 5 }, (_, tick) => <line key={tick} x1={left + tick * (right - left) / 4} x2={left + tick * (right - left) / 4} y1="28" y2={height - 8} stroke="var(--line)" />)}
    <line className="analytics-zero-line" x1={x(0)} x2={x(0)} y1="28" y2={height - 8} stroke="var(--muted)" />
    {series.map((item, seriesIndex) => {
      const value = item.values[index];
      const center = 42 + seriesIndex * 28;
      return <g key={item.id}>
        {value != null && <rect data-series={item.id} x={Math.min(x(value), x(0))} y={center - 8} width={Math.abs(x(value) - x(0))} height="16" fill={item.color} rx="1" />}
        <text className="analytics-bar-value" data-series={item.id} x={width - 4} y={center + 5} textAnchor="end">{label(value)}</text>
      </g>;
    })}
    <rect className="analytics-hit" x="0" y="0" width={width} height={height} fill="transparent" tabIndex={0} role="button" aria-label={point.detail} aria-pressed={point.dailyRevenueDetails !== undefined ? selected === point.label : undefined}
      onMouseEnter={() => inspect(point)} onFocus={() => inspect(point)} onClick={() => activate(point)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(point); } }}><title>{point.detail}</title></rect>
  </svg>);
}
