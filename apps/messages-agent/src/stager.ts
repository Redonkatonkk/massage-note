import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function stagerPath() {
  const path = process.env.MASSAGE_NOTE_MESSAGES_STAGER;
  if (!path) throw new Error("MASSAGE_NOTE_MESSAGES_STAGER is required");
  return path;
}

export async function messagesStagerReady() {
  await execFileAsync(stagerPath(), ["--diagnose"], { timeout: 15_000 });
}

export async function stageMessagesAttachment(sourcePath: string, jobId: string) {
  const { stdout } = await execFileAsync(stagerPath(), [sourcePath, jobId], { timeout: 30_000 });
  const stagedPath = stdout.trim();
  const allowedRoot = resolve(join(homedir(), "Library", "Messages", "Attachments", "MassageNote"));
  const expectedPath = resolve(join(allowedRoot, jobId.slice(0, 2).toLowerCase(), jobId.toLowerCase(), "closing.png"));
  if (!stagedPath || resolve(stagedPath) !== expectedPath) {
    throw new Error("Messages attachment stager returned an invalid path");
  }
  return stagedPath;
}
