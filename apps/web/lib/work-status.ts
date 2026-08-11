export interface TimedWorkRecord {
  startAt: string;
  endAt: string | null;
  status: "PENDING_PAYMENT" | "CONFIRMED";
}

export function activeWorkRecord<T extends TimedWorkRecord>(
  records: T[],
  nowMs: number,
): T | null {
  let active: T | null = null;
  let activeEnd = Number.NEGATIVE_INFINITY;

  for (const record of records) {
    if (record.status !== "PENDING_PAYMENT") continue;

    const start = Date.parse(record.startAt);
    if (!Number.isFinite(start) || start > nowMs) continue;

    const end = record.endAt === null ? Number.POSITIVE_INFINITY : Date.parse(record.endAt);
    if (record.endAt !== null && (!Number.isFinite(end) || end <= nowMs)) continue;

    if (end > activeEnd) {
      active = record;
      activeEnd = end;
    }
  }

  return active;
}
