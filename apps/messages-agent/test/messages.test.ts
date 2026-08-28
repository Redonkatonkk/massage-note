import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { messagesAttachmentScript } from "../src/messages.js";

const execFileAsync = promisify(execFile);

describe("Messages AppleScript", () => {
  it("通过标准 run handler 接收 osascript 参数", () => {
    expect(messagesAttachmentScript).toContain("on run argv");
    expect(messagesAttachmentScript).toContain("set phoneNumber to item 1 of argv");
    expect(messagesAttachmentScript).toContain("set filePath to item 2 of argv");
    expect(messagesAttachmentScript).toContain("set messageText to item 3 of argv");
  });

  it.skipIf(process.platform !== "darwin")("可由 macOS AppleScript 编译器编译", async () => {
    const directory = await mkdtemp(join(tmpdir(), "messages-script-test-"));
    try {
      const sourcePath = join(directory, "messages.applescript");
      const compiledPath = join(directory, "messages.scpt");
      await writeFile(sourcePath, messagesAttachmentScript, "utf8");
      await execFileAsync("/usr/bin/osacompile", ["-o", compiledPath, sourcePath]);
      expect((await readFile(compiledPath)).length).toBeGreaterThan(100);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
