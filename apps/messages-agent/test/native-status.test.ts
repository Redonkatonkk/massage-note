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

describe.skipIf(process.platform !== "darwin")("read-only native send-status metadata", () => {
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), "messages-status-test-"));
    executable = join(directory, "reader"); database = join(directory, "fixture.db");
    const main = join(directory, "main.swift");
    await writeFile(main, `import Foundation\nlet args = CommandLine.arguments\nlet database = try MessagesDeliveryDatabase(url: URL(fileURLWithPath: args[1]))\nlet observation = try database.observation(attachment: URL(fileURLWithPath: args[2]), phone: args[3], home: URL(fileURLWithPath: "/Users/fixture"))\nlet json = try JSONSerialization.data(withJSONObject: observation.json)\nprint(String(data: json, encoding: .utf8)!)\n`);
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
""")
c.commit();c.close()`, database]);
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
  it("所有查询保持数据库字节不变，数据库不存在时绝不创建新库", async () => {
    const hash = async () => createHash("sha256").update(await readFile(database)).digest("hex");
    const before = await hash(); await status("/Users/fixture/task-sent.png"); expect(await hash()).toBe(before);
    const missing = join(directory, "does-not-exist.db");
    await expect(exec(executable, [missing, "/Users/fixture/task-sent.png", "+13105551234"])).rejects.toThrow();
    await expect(readFile(missing)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
