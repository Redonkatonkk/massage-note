/** Cubic segments stay between adjacent values and never bridge missing samples. */
export function smoothChartPath(values: readonly (number | null | undefined)[], x: (index: number) => number, y: (value: number) => number): string {
  let previous: { x: number; y: number } | null = null;
  return values.map((value, index) => {
    if (value == null) { previous = null; return ""; }
    const point = { x: x(index), y: y(value) };
    const middle = previous ? (previous.x + point.x) / 2 : 0;
    const segment = previous ? `C${middle},${previous.y} ${middle},${point.y} ${point.x},${point.y}` : `M${point.x},${point.y}`;
    previous = point;
    return segment;
  }).join(" ");
}
