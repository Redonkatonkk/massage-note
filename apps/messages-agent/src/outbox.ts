import { randomUUID } from "node:crypto";
import { chmod, link, lstat, mkdir, readFile, readdir, rm, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

export const OUTBOX_RETENTION_MS = 30 * 60_000;
const TEXT_RETENTION_MS = 30 * 24 * 60 * 60_000;

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

export async function prepareClosingText(outboxDir: string, jobId: string, body: string, kind: "closing" | "dispatch" = "closing") {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(jobId)) {
    throw new Error("Invalid closing delivery job id");
  }
  const format = kind === "closing"
    ? /https:\/\/[A-Za-z0-9.-]+(?::\d{1,5})?\/share\/daily-snapshot#[A-Za-z0-9_-]{43}$/
    : /^\d{4}-\d{2}-\d{2}排工顺序\n(?:明日暂无排工|第[零一二三四五六七八九十百千\d]+：[^\n]+(?:\n第[零一二三四五六七八九十百千\d]+：[^\n]+)*)$/u;
  if (typeof body !== "string" || Buffer.byteLength(body) > 4096 || body.includes("\0") || !format.test(body.trimEnd())) {
    throw new Error(kind === "closing" ? "Invalid closing message text" : "Invalid dispatch message text");
  }
  const path = join(outboxDir, `${jobId}-${kind}.txt`);
  const temporary = join(outboxDir, `${jobId}-${kind}-${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, body, { encoding: "utf8", flag: "wx", mode: 0o600 });
    try {
      // Publish a complete file atomically without replacing another attempt's text.
      await link(temporary, path);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const file = await lstat(path);
      if (!file.isFile() || (file.mode & 0o777) !== 0o600 || file.size > 4096 || await readFile(path, "utf8") !== body) {
        throw new Error(`A different ${kind} message already exists for this job`);
      }
    }
  } finally {
    await rm(temporary, { force: true });
  }
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
    if (!entry.isFile() || !/^[a-f0-9-]{36}(?:\.png|-details\.jpg|-(?:closing|dispatch)\.txt|-(?:closing|dispatch)-[a-f0-9-]{36}\.tmp)$/i.test(entry.name)) continue;
    const path = join(outboxDir, entry.name);
    const details = await stat(path);
    const retention = entry.name.endsWith(".txt") ? TEXT_RETENTION_MS : OUTBOX_RETENTION_MS;
    if (now - details.mtimeMs < retention) continue;
    await unlink(path);
    removed += 1;
  }
  return removed;
}
