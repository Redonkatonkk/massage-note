import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { messagesAttachmentScript, messagesPhoneHandle } from "../src/messages.js";

const execFileAsync = promisify(execFile);

describe("Messages AppleScript", () => {
  it("通过标准 run handler 接收 osascript 参数", () => {
    expect(messagesAttachmentScript).toContain("on run argv");
    expect(messagesAttachmentScript).toContain("set phoneNumber to item 1 of argv");
    expect(messagesAttachmentScript).toContain("set filePath to item 2 of argv");
    expect(messagesAttachmentScript).toContain("set attachmentKind to item 3 of argv");
    expect(messagesAttachmentScript).not.toContain("messageText");
    expect(messagesAttachmentScript).not.toContain("send messageText");
    expect(messagesAttachmentScript.match(/send POSIX file/g)).toHaveLength(1);
  });

  it("PDF 文档跳过会异步拒绝该格式的 SMS/MMS 通道", () => {
    expect(messagesAttachmentScript).toContain('if attachmentKind is "DOCUMENT" then set requestedTypes to {"iMessage", "RCS"}');
    expect(messagesAttachmentScript).toContain('set requestedTypes to {"SMS", "RCS", "iMessage"}');
  });

  it("逐个忽略 macOS 26 无法转换的账户类型", () => {
    expect(messagesAttachmentScript).toContain("repeat with targetAccount in accounts");
    expect(messagesAttachmentScript).toContain('set accountType to ""');
    expect(messagesAttachmentScript).toContain("on error");
    expect(messagesAttachmentScript).toContain("enabled of targetAccount is true");
  });

  it("美国 E.164 号码交给 Messages 时使用已验证的十位号码", () => {
    expect(messagesPhoneHandle("+17705750450")).toBe("7705750450");
    expect(messagesPhoneHandle("+442071838750")).toBe("+442071838750");
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
