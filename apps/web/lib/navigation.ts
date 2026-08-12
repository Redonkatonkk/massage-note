export function financeClosingHref(storeId: string, businessDate: string): string {
  const params = new URLSearchParams({
    store: storeId,
    tab: "closing",
    date: businessDate,
  });
  return `/finance?${params.toString()}`;
}

export function workRecordHref(
  storeId: string,
  businessDate: string,
  recordId: string,
): string {
  const params = new URLSearchParams({
    store: storeId,
    date: businessDate,
    record: recordId,
  });
  return `/?${params.toString()}`;
}
