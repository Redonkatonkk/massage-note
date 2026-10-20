// Wait after processing, before claiming another job: no lease is held while cooling down.
// Both delivery queues share the same serial worker and cooldown, including failures.
export const DELIVERY_COOLDOWN_MS = 120_000;
export const FAILURE_COOLDOWN_MS = 300_000;

export async function waitForDeliveryCooldown(nextClaimAt?: string) {
  const remaining = nextClaimAt ? Date.parse(nextClaimAt) - Date.now() : 0;
  if (remaining > 0) await new Promise<void>(resolve => setTimeout(resolve, remaining));
}

export async function withDeliveryCooldown<T>(process: () => Promise<T>, persist: (until: string) => Promise<void> = async () => {}): Promise<T> {
  let failed = false;
  try {
    return await process();
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    const until = new Date(Date.now() + (failed ? FAILURE_COOLDOWN_MS : DELIVERY_COOLDOWN_MS)).toISOString();
    await persist(until);
    await waitForDeliveryCooldown(until);
  }
}
