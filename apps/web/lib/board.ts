export function deduplicateMembershipRows<T extends { membershipId: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.membershipId)) return false;
    seen.add(row.membershipId);
    return true;
  });
}

export function discountBadgeText(cents: number): string {
  const normalizedCents = Math.trunc(cents);
  const sign = normalizedCents < 0 ? "-" : "";
  const absoluteCents = Math.abs(normalizedCents);
  const dollars = Math.trunc(absoluteCents / 100);
  const remainder = absoluteCents % 100;
  const decimal = remainder === 0
    ? ""
    : remainder % 10 === 0
      ? `.${remainder / 10}`
      : `.${remainder.toString().padStart(2, "0")}`;

  return `off${sign}${dollars}${decimal}`;
}
