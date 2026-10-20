import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { messagesStagerReady, stageMessagesAttachment, sendStagedMessagesAttachment, messagesDeliveryState, type MessagesDeliveryState } from "../src/stager.js";

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

async function prepareOpenMock(payload: { ok: boolean; path?: string; error?: string; service?: string; delivery?: MessagesDeliveryState }) {
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
  it("状态查询只传递该任务号码、UUID 和固定文件名，使用独立回执", async () => {
    const jobId = "ab48f3d5-8a80-4260-98ae-e8b4fd603d14";
    const path = join(process.env.HOME!, "Library", "Messages", "Attachments", "MassageNote", "ab", jobId, "closing.png");
    const delivery: MessagesDeliveryState = { messageGuid: "new", state: "FAILED", errorCode: 100, service: "SMS" };
    const { log } = await prepareOpenMock({ ok: true, delivery });
    await expect(messagesDeliveryState("+13105551234", path)).resolves.toEqual(delivery);
    const args = (await readFile(log, "utf8")).trim().split("\n");
    expect(args.slice(5, 9)).toEqual(["--status", "+13105551234", jobId, "closing.png"]);
    expect(args.at(-1)).toBe(join(process.env.MASSAGE_NOTE_AGENT_DATA_DIR!, "stager-results", `${jobId}-status.json`));
  });

  it("查询状态回执缺失时拒绝确认成功", async () => {
    const jobId = "ab48f3d5-8a80-4260-98ae-e8b4fd603d14";
    await prepareOpenMock({ ok: true });
    await expect(messagesDeliveryState("+13105551234", join(process.env.HOME!, "Library", "Messages", "Attachments", "MassageNote", "ab", jobId, "closing.png"))).rejects.toThrow("metadata is invalid");
  });
  it("同一个受限 App 负责发送，回执使用单独文件并保留实际路由", async () => {
    const jobId = "ab48f3d5-8a80-4260-98ae-e8b4fd603d14";
    const path = join(process.env.HOME!, "Library", "Messages", "Attachments", "MassageNote", "ab", jobId, "closing.png");
    const { log } = await prepareOpenMock({ ok: true, service: "SMS" });
    await expect(sendStagedMessagesAttachment("+13105551234", path, "IMAGE")).resolves.toEqual({ service: "SMS", previousMessageGuid: null });
    const args = (await readFile(log, "utf8")).trim().split("\n");
    expect(args.slice(0, 10)).toEqual(["-g", "-n", "-a", "/Applications/Test Stager.app", "--args", "--send", "+13105551234", jobId, "closing.png", "IMAGE"]);
    expect(args.at(-1)).toBe(join(process.env.MASSAGE_NOTE_AGENT_DATA_DIR!, "stager-results", `${jobId}-send.json`));
  });

  it("发送回执缺少实际路由时不报告成功", async () => {
    const jobId = "ab48f3d5-8a80-4260-98ae-e8b4fd603d14";
    await prepareOpenMock({ ok: true });
    await expect(sendStagedMessagesAttachment("+13105551234", join(process.env.HOME!, "Library", "Messages", "Attachments", "MassageNote", "ab", jobId, "closing.png"), "IMAGE")).rejects.toThrow("did not confirm");
  });

  it("拒绝不属于发送任务的路径和无效号码", async () => {
    await prepareOpenMock({ ok: true, service: "SMS" });
    await expect(sendStagedMessagesAttachment("+13105551234", "/tmp/closing.png", "IMAGE")).rejects.toThrow("Invalid");
    await expect(sendStagedMessagesAttachment("not-a-phone", "/tmp/closing.png", "IMAGE")).rejects.toThrow("Invalid");
  });
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
