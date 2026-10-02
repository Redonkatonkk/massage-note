export const FEEDBACK_DURATION_MS = 3_000;

export function createFeedbackTimer(dismiss: () => void) {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  function cancel() {
    clearTimeout(timeout);
    timeout = undefined;
  }

  function restart() {
    cancel();
    timeout = setTimeout(() => {
      timeout = undefined;
      dismiss();
    }, FEEDBACK_DURATION_MS);
  }

  return { restart, cancel };
}
