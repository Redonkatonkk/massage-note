import { execFile } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface StagerResult {
  ok: boolean;
  path?: string;
  error?: string;
  service?: string;
  previousMessageGuid?: string;
  delivery?: MessagesDeliveryState;
}

export interface MessagesSubmission { service: string; previousMessageGuid: string | null }
export interface MessagesDeliveryState {
  messageGuid: string | null;
  state: "MISSING" | "PENDING" | "SENT" | "DELIVERED" | "FAILED";
  errorCode: number;
  service: string | null;
}

function stagerAppPath() {
  const appPath = process.env.MASSAGE_NOTE_MESSAGES_STAGER_APP;
  if (!appPath) throw new Error("MASSAGE_NOTE_MESSAGES_STAGER_APP is required");
  return appPath;
}

function agentDataDir() {
  return process.env.MASSAGE_NOTE_AGENT_DATA_DIR
    ?? join(homedir(), "Library", "Application Support", "Massage Note Messages Agent");
}

async function waitForResult(resultPath: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const result = JSON.parse(await readFile(resultPath, "utf8")) as StagerResult;
      await rm(resultPath, { force: true });
      if (!result.ok) throw new Error(result.error || "Messages attachment stager failed");
      return result;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    await delay(100);
  }
  throw new Error(`Messages attachment stager did not return a result within ${timeoutMs / 1000} seconds`);
}

async function launchStager(arguments_: string[], resultName: string, timeoutMs = 15_000) {
  const resultDir = join(agentDataDir(), "stager-results");
  await mkdir(resultDir, { recursive: true, mode: 0o700 });
  const resultPath = join(resultDir, resultName);
  await rm(resultPath, { force: true });
  await execFileAsync(
    process.env.MASSAGE_NOTE_OPEN_BIN ?? "/usr/bin/open",
    ["-g", "-n", "-a", stagerAppPath(), "--args", ...arguments_, resultPath],
    { timeout: 15_000 },
  );
  return waitForResult(resultPath, timeoutMs);
}

export async function messagesStagerReady() {
  await launchStager(["--diagnose"], "diagnose.json", 60_000);
}

export async function sendStagedMessagesAttachment(
  phoneE164: string,
  attachmentPath: string,
  kind: "IMAGE" | "CONVERSATION_IMAGE",
) {
  const jobId = basename(dirname(attachmentPath));
  const fileName = basename(attachmentPath);
  const expected = join(homedir(), "Library", "Messages", "Attachments", "MassageNote", jobId.slice(0, 2), jobId, fileName);
  if (!/^\+[1-9]\d{7,14}$/.test(phoneE164)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(jobId)
    || !["closing.png", "settlement-details.jpg"].includes(fileName)
    || resolve(attachmentPath) !== expected) {
    throw new Error("Invalid Messages attachment send request");
  }
  const result = await launchStager(["--send", phoneE164, jobId, fileName, kind], `${jobId}-send.json`, 75_000);
  if (!result.service?.trim()) throw new Error("Messages attachment stager did not confirm an accepted service");
  return { service: result.service.trim(), previousMessageGuid: result.previousMessageGuid ?? null } satisfies MessagesSubmission;
}

export function taskMessagesPath(jobId: string, fileName: "closing.png" | "settlement-details.jpg") {
  return join(homedir(), "Library", "Messages", "Attachments", "MassageNote", jobId.slice(0, 2), jobId, fileName);
}

export async function messagesDeliveryState(phoneE164: string, attachmentPath: string): Promise<MessagesDeliveryState> {
  const jobId = basename(dirname(attachmentPath));
  const fileName = basename(attachmentPath);
  if (!/^\+[1-9]\d{7,14}$/.test(phoneE164)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(jobId)
    || !["closing.png", "settlement-details.jpg"].includes(fileName)
    || attachmentPath !== taskMessagesPath(jobId, fileName as "closing.png" | "settlement-details.jpg")) {
    throw new Error("Invalid Messages status request");
  }
  const { delivery } = await launchStager(["--status", phoneE164, jobId, fileName], `${jobId}-status.json`);
  if (!delivery || !["MISSING", "PENDING", "SENT", "DELIVERED", "FAILED"].includes(delivery.state)
    || !Number.isInteger(delivery.errorCode)
    || !(delivery.messageGuid === null || typeof delivery.messageGuid === "string")
    || !(delivery.service === null || typeof delivery.service === "string")) {
    throw new Error("Messages send-status metadata is invalid");
  }
  return delivery;
}

export async function stageMessagesAttachment(sourcePath: string, jobId: string, fileName = "closing.png", reuseExisting = false) {
  const arguments_ = fileName === "closing.png"
    ? [sourcePath, jobId]
    : [sourcePath, jobId, fileName, ...(reuseExisting ? ["--reuse-existing"] : [])];
  const result = await launchStager(arguments_, `${jobId.toLowerCase()}.json`);
  const stagedPath = result.path?.trim() ?? "";
  const allowedRoot = resolve(join(homedir(), "Library", "Messages", "Attachments", "MassageNote"));
  const expectedPath = resolve(join(allowedRoot, jobId.slice(0, 2).toLowerCase(), jobId.toLowerCase(), fileName));
  if (!stagedPath || resolve(stagedPath) !== expectedPath) {
    throw new Error("Messages attachment stager returned an invalid path");
  }
  return stagedPath;
}
