import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { messagesStagerReady, stageMessagesAttachment } from "../src/stager.js";

const previousStager = process.env.MASSAGE_NOTE_MESSAGES_STAGER;
const directories: string[] = [];

afterEach(async () => {
  if (previousStager === undefined) delete process.env.MASSAGE_NOTE_MESSAGES_STAGER;
  else process.env.MASSAGE_NOTE_MESSAGES_STAGER = previousStager;
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("Messages attachment stager", () => {
  it("缺少原生暂存程序路径时拒绝运行", async () => {
    delete process.env.MASSAGE_NOTE_MESSAGES_STAGER;
    await expect(messagesStagerReady()).rejects.toThrow("MASSAGE_NOTE_MESSAGES_STAGER is required");
  });

  it("只接受 Messages MassageNote 附件目录中的返回路径", async () => {
    const directory = await mkdtemp(join(tmpdir(), "messages-stager-test-"));
    directories.push(directory);
    const helper = join(directory, "stager.sh");
    const log = join(directory, "arguments.txt");
    const jobId = "ab48f3d5-8a80-4260-98ae-e8b4fd603d14";
    const validPath = join(process.env.HOME!, "Library", "Messages", "Attachments", "MassageNote", "ab", jobId, "closing.png");
    await writeFile(helper, `#!/bin/sh\nprintf '%s\\n' "$@" > ${JSON.stringify(log)}\nprintf '%s\\n' ${JSON.stringify(validPath)}\n`);
    await chmod(helper, 0o700);
    process.env.MASSAGE_NOTE_MESSAGES_STAGER = helper;

    await messagesStagerReady();
    expect(await stageMessagesAttachment("/source/closing.png", jobId)).toBe(validPath);
    expect(await readFile(log, "utf8")).toContain(jobId);
  });

  it("拒绝暂存程序返回任意外部路径", async () => {
    const directory = await mkdtemp(join(tmpdir(), "messages-stager-invalid-test-"));
    directories.push(directory);
    const helper = join(directory, "stager.sh");
    await writeFile(helper, "#!/bin/sh\nprintf '/tmp/not-allowed.png\\n'\n");
    await chmod(helper, 0o700);
    process.env.MASSAGE_NOTE_MESSAGES_STAGER = helper;

    await expect(stageMessagesAttachment("/source/closing.png", "job-id")).rejects.toThrow("invalid path");
  });
});
