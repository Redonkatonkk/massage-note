/** Trim empty edge hours while keeping zero-count hours between service starts. */
export function visibleAnalyticsHours(hours: readonly { hour: number; count: number }[]) {
  const first = hours.findIndex(row => row.count > 0);
  if (first === -1) return [];
  let last = hours.length - 1;
  while (last > first && hours[last]!.count === 0) last--;
  return hours.slice(first, last + 1);
}
