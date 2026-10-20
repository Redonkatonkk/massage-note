/** Child-process errors include the full command, script and recipient in message. */
export function agentErrorMessage(error: unknown): string {
  const stderr = error && typeof error === "object" && "stderr" in error
    ? String(error.stderr ?? "").trim()
    : "";
  const detail = (stderr || (error instanceof Error ? error.message : String(error))).trim()
    .replace(/\+?\b\d{10,15}\b/g, "[phone]") || "Unknown agent error";
  // Both the heartbeat and failure contracts allow at most 1000 UTF-16 units.
  return detail.length > 1000 ? `…${detail.slice(-999)}` : detail;
}
