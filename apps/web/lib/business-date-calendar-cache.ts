export interface OpenWorkDatesResponse {
  dates: string[];
  closedDates: Array<{ date: string; discountedFeePerformanceCents: number; revenueCents: number }>;
}

/** Page-local memory only: survives board remounts, never persists business data. */
export function createBusinessDateCalendarCache() {
  const entries = new Map<string, { data?: OpenWorkDatesResponse; request: Promise<OpenWorkDatesResponse> }>();
  const keyFor = (storeId: string, month: string) => `${storeId}/${month}`;

  return {
    peek(storeId: string, month: string) {
      return entries.get(keyFor(storeId, month))?.data;
    },
    load(storeId: string, month: string, fetchDates: () => Promise<OpenWorkDatesResponse>) {
      const key = keyFor(storeId, month);
      const cached = entries.get(key);
      if (cached) return cached.request;

      const entry: { data?: OpenWorkDatesResponse; request: Promise<OpenWorkDatesResponse> } = {
        request: Promise.resolve().then(fetchDates).then(data => {
          // Invalidated requests may finish, but cannot restore old cache entries.
          if (entries.get(key) === entry) entry.data = data;
          return data;
        }).catch(error => {
          if (entries.get(key) === entry) entries.delete(key);
          throw error;
        }),
      };
      entries.set(key, entry);
      if (entries.size > 12) entries.delete(entries.keys().next().value!);
      return entry.request;
    },
    invalidate() { entries.clear(); },
  };
}

export type BusinessDateCalendarCache = ReturnType<typeof createBusinessDateCalendarCache>;
