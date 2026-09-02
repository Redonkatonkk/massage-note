import { chmod, mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";

export const OUTBOX_RETENTION_MS = 30 * 60_000;

export async function prepareOutbox(dataDir: string) {
  const outboxDir = join(dataDir, "outbox");
  await mkdir(outboxDir, { recursive: true, mode: 0o700 });
  await chmod(outboxDir, 0o700);
  return outboxDir;
}

export function closingPngPath(outboxDir: string, jobId: string) {
  if (!/^[a-f0-9-]{36}$/i.test(jobId)) throw new Error("invalid closing delivery job id");
  return join(outboxDir, `${jobId}.png`);
}

export function settlementAttachmentPath(outboxDir: string, jobId: string) {
  if (!/^[a-f0-9-]{36}$/i.test(jobId)) throw new Error("invalid settlement delivery job id");
  return join(outboxDir, `${jobId}-details.jpg`);
}

export async function secureClosingPng(path: string) {
  await chmod(path, 0o600);
}

export const secureAttachment = secureClosingPng;

export async function cleanupOutbox(outboxDir: string, now = Date.now()) {
  const entries = await readdir(outboxDir, { withFileTypes: true });
  let removed = 0;
  for (const entry of entries) {
    if (!entry.isFile() || !/^[a-f0-9-]{36}(?:\.png|-details\.jpg)$/i.test(entry.name)) continue;
    const path = join(outboxDir, entry.name);
    const details = await stat(path);
    if (now - details.mtimeMs < OUTBOX_RETENTION_MS) continue;
    await unlink(path);
    removed += 1;
  }
  return removed;
}
