import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { messagesStagerReady, stageMessagesAttachment } from "../src/stager.js";

const previousApp = process.env.MASSAGE_NOTE_MESSAGES_STAGER_APP;
const previousDataDir = process.env.MASSAGE_NOTE_AGENT_DATA_DIR;
const previousOpen = process.env.MASSAGE_NOTE_OPEN_BIN;
const directories: string[] = [];

afterEach(async () => {
  if (previousApp === undefined) delete process.env.MASSAGE_NOTE_MESSAGES_STAGER_APP;
  else process.env.MASSAGE_NOTE_MESSAGES_STAGER_APP = previousApp;
  if (previousDataDir === undefined) delete process.env.MASSAGE_NOTE_AGENT_DATA_DIR;
  else process.env.MASSAGE_NOTE_AGENT_DATA_DIR = previousDataDir;
  if (previousOpen === undefined) delete process.env.MASSAGE_NOTE_OPEN_BIN;
  else process.env.MASSAGE_NOTE_OPEN_BIN = previousOpen;
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function prepareOpenMock(payload: { ok: boolean; path?: string; error?: string }) {
  const directory = await mkdtemp(join(tmpdir(), "messages-stager-test-"));
  directories.push(directory);
  const helper = join(directory, "open.sh");
  const log = join(directory, "arguments.txt");
  await writeFile(
    helper,
    `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(log)}\nfor result_path do :; done\nmkdir -p "$(dirname "$result_path")"\nprintf '%s' ${JSON.stringify(JSON.stringify(payload))} > "$result_path"\n`,
  );
  await chmod(helper, 0o700);
  process.env.MASSAGE_NOTE_MESSAGES_STAGER_APP = "/Applications/Test Stager.app";
  process.env.MASSAGE_NOTE_AGENT_DATA_DIR = directory;
  process.env.MASSAGE_NOTE_OPEN_BIN = helper;
  return { log };
}

describe("Messages attachment stager", () => {
  it("缺少原生暂存 App 路径时拒绝运行", async () => {
    delete process.env.MASSAGE_NOTE_MESSAGES_STAGER_APP;
    await expect(messagesStagerReady()).rejects.toThrow("MASSAGE_NOTE_MESSAGES_STAGER_APP is required");
  });

  it("通过 LaunchServices 后台启动并只接受精确 Messages 路径", async () => {
    const jobId = "ab48f3d5-8a80-4260-98ae-e8b4fd603d14";
    const validPath = join(process.env.HOME!, "Library", "Messages", "Attachments", "MassageNote", "ab", jobId, "closing.png");
    const { log } = await prepareOpenMock({ ok: true, path: validPath });

    expect(await stageMessagesAttachment("/source/closing.png", jobId)).toBe(validPath);
    const argumentsLog = await readFile(log, "utf8");
    expect(argumentsLog).toContain("-g");
    expect(argumentsLog).toContain("-n");
    expect(argumentsLog).toContain("/Applications/Test Stager.app");
    expect(argumentsLog).toContain(jobId);
  });

  it("把 App 报告的暂存错误保持为发送前失败", async () => {
    await prepareOpenMock({ ok: false, error: "Full Disk Access denied" });
    await expect(messagesStagerReady()).rejects.toThrow("Full Disk Access denied");
  });

  it("严格接受区间结算长图的固定 Messages 路径", async () => {
    const jobId = "ab48f3d5-8a80-4260-98ae-e8b4fd603d14";
    const validPath = join(process.env.HOME!, "Library", "Messages", "Attachments", "MassageNote", "ab", jobId, "settlement-details.jpg");
    await prepareOpenMock({ ok: true, path: validPath });
    await expect(stageMessagesAttachment("/source/details.jpg", jobId, "settlement-details.jpg", true)).resolves.toBe(validPath);
  });

  it("长图重试要求暂存程序复用同任务已经校验的附件", async () => {
    const jobId = "ab48f3d5-8a80-4260-98ae-e8b4fd603d14";
    const validPath = join(process.env.HOME!, "Library", "Messages", "Attachments", "MassageNote", "ab", jobId, "settlement-details.jpg");
    const { log } = await prepareOpenMock({ ok: true, path: validPath });
    await stageMessagesAttachment("/source/details.jpg", jobId, "settlement-details.jpg", true);
    expect(await readFile(log, "utf8")).toContain("--reuse-existing");
  });

  it("拒绝暂存 App 返回任意外部路径", async () => {
    await prepareOpenMock({ ok: true, path: "/tmp/not-allowed.png" });
    await expect(stageMessagesAttachment("/source/closing.png", "ab48f3d5-8a80-4260-98ae-e8b4fd603d14")).rejects.toThrow("invalid path");
  });
});
