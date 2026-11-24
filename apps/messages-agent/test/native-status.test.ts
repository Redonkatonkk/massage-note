import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
const exec = promisify(execFile);
let directory: string;
let executable: string;
let database: string;
const link = "https://demo.invalid/share/daily-snapshot#" + "a".repeat(43);
const attributedLink = "https://demo.invalid/share/daily-snapshot#" + "b".repeat(43);
const body = "Sample daily summary\nDetails: " + link;

describe.skipIf(process.platform !== "darwin")("read-only native send-status metadata", () => {
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "messages-status-test-"));
    executable = join(directory, "reader"); database = join(directory, "fixture.db");
    const main = join(directory, "main.swift");
    await writeFile(main, `import Foundation
let args = CommandLine.arguments
let database = try MessagesDeliveryDatabase(url: URL(fileURLWithPath: args[1]))
let observation: MessageDeliveryObservation
if args[2] == "--text" {
    observation = try database.observation(text: args[3], bodyMarker: args[4], phone: args[5])
} else if args[2] == "--guid" {
    observation = try database.observation(messageGuid: args[3], phone: args[4])
} else {
    observation = try database.observation(attachment: URL(fileURLWithPath: args[2]), phone: args[3], home: URL(fileURLWithPath: "/Users/fixture"))
}
let json = try JSONSerialization.data(withJSONObject: observation.json)
print(String(data: json, encoding: .utf8)!)
`);
    await exec("/usr/bin/xcrun", ["swiftc", "-lsqlite3", resolve("macos/MessagesDeliveryState.swift"), main, "-o", executable]);
    await exec("/usr/bin/python3", ["-c", `import sqlite3,sys
c=sqlite3.connect(sys.argv[1])
c.executescript("""
CREATE TABLE message (guid TEXT,is_sent INTEGER,is_delivered INTEGER,error INTEGER,service TEXT,is_from_me INTEGER,handle_id INTEGER,text TEXT);
CREATE TABLE attachment (filename TEXT);
CREATE TABLE message_attachment_join (message_id INTEGER,attachment_id INTEGER);
CREATE TABLE handle (id TEXT);
INSERT INTO handle VALUES ('3105551234'), ('+13105555678');
INSERT INTO attachment VALUES ('/Users/fixture/task-failed.png'), ('~/task-sent.png'), ('/Users/fixture/task-pending.png');
INSERT INTO message VALUES ('failed',1,1,100,'SMS',1,1,'SECRET BODY'), ('sent',1,0,0,'SMS',1,1,'SECRET BODY'), ('pending',0,0,0,'RCS',1,1,'SECRET BODY'), ('wrong-peer',1,1,0,'RCS',1,2,'SECRET BODY'), ('incoming',1,1,0,'RCS',0,1,'SECRET BODY');
INSERT INTO message_attachment_join VALUES (1,1),(2,2),(3,3),(4,1),(5,1);
ALTER TABLE message ADD COLUMN attributedBody BLOB;
""")
c.executemany("INSERT INTO message VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [
    ('exact-text', 1, 0, 0, 'SMS', 1, 1, sys.argv[2], None),
    ('wrong-body', 1, 1, 0, 'SMS', 1, 1, 'Unrelated message', None),
    ('wrong-peer-text', 1, 1, 0, 'SMS', 1, 2, sys.argv[2], None),
    ('incoming-text', 1, 1, 0, 'SMS', 0, 1, sys.argv[2], None),
    ('encoded-text', 1, 1, 0, 'iMessage', 1, 1, None, b'archive' + sys.argv[3].encode() + b'payload'),
])
c.commit();c.close()`, database, body, attributedLink]);
  }, 30_000);
  afterAll(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });
  async function status(path: string) {
    const { stdout } = await exec(executable, [database, path, "+13105551234"]);
    expect(stdout).not.toContain("SECRET BODY");
    return JSON.parse(stdout);
  }
  it("精确限定任务附件、接收号码和出站消息，显式错误优先于旧成功标志", async () => {
    expect(await status("/Users/fixture/task-failed.png")).toMatchObject({ messageGuid: "failed", state: "FAILED", errorCode: 100 });
  });
  it("区别已发出、待发送和无记录，兼容波浪号路径", async () => {
    expect(await status("/Users/fixture/task-sent.png")).toMatchObject({ state: "SENT", service: "SMS" });
    expect(await status("/Users/fixture/task-pending.png")).toMatchObject({ state: "PENDING" });
    expect(await status("/Users/fixture/missing.png")).toMatchObject({ state: "MISSING", messageGuid: null });
  });
  it("文字回执限定出站号码和精确正文或任务专属链接，返回值只有状态元数据", async () => {
    const phone = "+13105551234";
    const invoke = async (...args: string[]) => {
      const { stdout } = await exec(executable, [database, ...args]);
      expect(stdout).not.toContain("https://");
      expect(stdout).not.toContain("Sample daily summary");
      return JSON.parse(stdout);
    };
    await expect(invoke("--text", body, link, phone)).resolves.toMatchObject({ messageGuid: "exact-text", state: "SENT" });
    await expect(invoke("--text", "different body", link, phone)).resolves.toMatchObject({ messageGuid: null, state: "MISSING" });
    await expect(invoke("--text", "uncaptured body", attributedLink, phone)).resolves.toMatchObject({ messageGuid: "encoded-text", state: "DELIVERED" });
    await expect(invoke("--guid", "exact-text", phone)).resolves.toMatchObject({ messageGuid: "exact-text", state: "SENT" });
    await expect(invoke("--guid", "wrong-peer-text", phone)).resolves.toMatchObject({ messageGuid: null, state: "MISSING" });
    await expect(invoke("--guid", "incoming-text", phone)).resolves.toMatchObject({ messageGuid: null, state: "MISSING" });
  });
  it("所有查询保持数据库字节不变，数据库不存在时绝不创建新库", async () => {
    const hash = async () => createHash("sha256").update(await readFile(database)).digest("hex");
    const before = await hash(); await status("/Users/fixture/task-sent.png"); expect(await hash()).toBe(before);
    const missing = join(directory, "does-not-exist.db");
    await expect(exec(executable, [missing, "/Users/fixture/task-sent.png", "+13105551234"])).rejects.toThrow();
    await expect(readFile(missing)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
