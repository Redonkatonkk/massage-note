import { execFile } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

interface StagerResult {
  ok: boolean;
  path?: string;
  error?: string;
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

async function waitForResult(resultPath: string) {
  const deadline = Date.now() + 15_000;
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
  throw new Error("Messages attachment stager did not return a result within 15 seconds");
}

async function launchStager(arguments_: string[], resultName: string) {
  const resultDir = join(agentDataDir(), "stager-results");
  await mkdir(resultDir, { recursive: true, mode: 0o700 });
  const resultPath = join(resultDir, resultName);
  await rm(resultPath, { force: true });
  await execFileAsync(
    process.env.MASSAGE_NOTE_OPEN_BIN ?? "/usr/bin/open",
    ["-g", "-n", "-a", stagerAppPath(), "--args", ...arguments_, resultPath],
    { timeout: 15_000 },
  );
  return waitForResult(resultPath);
}

export async function messagesStagerReady() {
  await launchStager(["--diagnose"], "diagnose.json");
}

export async function stageMessagesAttachment(sourcePath: string, jobId: string, fileName = "closing.png") {
  const result = await launchStager(fileName === "closing.png" ? [sourcePath, jobId] : [sourcePath, jobId, fileName], `${jobId.toLowerCase()}.json`);
  const stagedPath = result.path?.trim() ?? "";
  const allowedRoot = resolve(join(homedir(), "Library", "Messages", "Attachments", "MassageNote"));
  const expectedPath = resolve(join(allowedRoot, jobId.slice(0, 2).toLowerCase(), jobId.toLowerCase(), fileName));
  if (!stagedPath || resolve(stagedPath) !== expectedPath) {
    throw new Error("Messages attachment stager returned an invalid path");
  }
  return stagedPath;
}
