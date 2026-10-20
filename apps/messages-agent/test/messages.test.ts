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
    expect(messagesAttachmentScript).toContain("set phoneE164 to item 2 of argv");
    expect(messagesAttachmentScript).toContain("set filePath to item 3 of argv");
    expect(messagesAttachmentScript).toContain("set attachmentKind to item 4 of argv");
    expect(messagesAttachmentScript).not.toContain("messageText");
    expect(messagesAttachmentScript).not.toContain("send messageText");
    expect(messagesAttachmentScript.match(/send POSIX file/g)).toHaveLength(2);
  });

  it("结算长图优先沿用该号码现有会话路由", () => {
    expect(messagesAttachmentScript).toContain('if attachmentKind is "CONVERSATION_IMAGE" then');
    expect(messagesAttachmentScript).toContain('set serviceUsed to sendToExistingChat(phoneE164, filePath)');
    expect(messagesAttachmentScript).toContain('set requestedTypes to {"SMS", "RCS", "iMessage"}');
    expect(messagesAttachmentScript).not.toContain("DOCUMENT");
    expect(messagesAttachmentScript).not.toContain("PDF");
  });

  it("逐个忽略 macOS 26 无法转换的账户类型", () => {
    expect(messagesAttachmentScript).toContain("repeat with targetAccount in accounts");
    expect(messagesAttachmentScript).toContain('set accountType to ""');
    expect(messagesAttachmentScript).toContain("on error");
    expect(messagesAttachmentScript).toContain("enabled of targetAccount is true");
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
