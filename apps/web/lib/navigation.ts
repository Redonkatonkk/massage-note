export function financeClosingHref(storeId: string, businessDate: string): string {
  const params = new URLSearchParams({
    store: storeId,
    tab: "closing",
    date: businessDate,
  });
  return `/finance?${params.toString()}`;
}
