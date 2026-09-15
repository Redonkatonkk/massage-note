/** Serialize refreshes and collapse a burst into one trailing refresh.
 * A notification received during a read must still trigger a later read.
 */
export function createRefreshQueue(refresh: () => Promise<void>) {
  let pending = false;
  let running: Promise<void> | undefined;
  let disposed = false;
  return {
    request(): Promise<void> {
      if (disposed) return Promise.resolve();
      pending = true;
      if (!running) {
        running = Promise.resolve().then(async () => {
          try {
            while (pending && !disposed) {
              pending = false;
              await refresh();
            }
          } finally {
            running = undefined;
          }
        });
      }
      return running;
    },
    dispose() { disposed = true; pending = false; },
  };
}
