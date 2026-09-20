// Wait after processing, before claiming another job: no lease is held while cooling down.
// Both delivery queues share the same serial worker and cooldown, including failures.
export async function withDeliveryCooldown<T>(process: () => Promise<T>): Promise<T> {
  try {
    return await process();
  } finally {
    await new Promise<void>(resolve => setTimeout(resolve, 60_000));
  }
}
