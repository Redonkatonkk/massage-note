export function deduplicateMembershipRows<T extends { membershipId: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.membershipId)) return false;
    seen.add(row.membershipId);
    return true;
  });
}
