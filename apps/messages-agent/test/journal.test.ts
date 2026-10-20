import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { loadJournal, saveJournal } from "../src/journal.js";

it("初始化缺失日志并原子保存已发送记录", async () => {
  const directory = await mkdtemp(join(tmpdir(), "message-journal-"));
  try {
    const path = join(directory, "journal.json");
    expect(await loadJournal(path)).toEqual({ accepted: [], completed: [] });
    await saveJournal(path, { accepted: ["delivery-id"], completed: [] });
    expect(await loadJournal(path)).toEqual({ accepted: ["delivery-id"], completed: [] });
    await expect(readFile(`${path}.tmp`)).rejects.toMatchObject({ code: "ENOENT" });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it("重启后保留已经开始但没有明确发送结果的任务，兼容旧版日志", async () => {
  const directory = await mkdtemp(join(tmpdir(), "message-journal-started-"));
  try {
    const path = join(directory, "journal.json");
    await writeFile(path, JSON.stringify({ accepted: ["old-accepted"], completed: ["old-completed"] }));
    const journal = await loadJournal(path);
    (journal.started ??= []).push("uncertain-send");
    await saveJournal(path, journal);
    expect(await loadJournal(path)).toEqual({ accepted: ["old-accepted"], completed: ["old-completed"], started: ["uncertain-send"] });
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it("重启后保留观察中的任务及上次消息 GUID，不丢失下次领取时间", async () => {
  const directory = await mkdtemp(join(tmpdir(), "message-journal-monitor-"));
  try {
    const path = join(directory, "journal.json");
    const journal = { accepted: [], completed: [], submitted: { task: { service: "SMS", previousMessageGuid: "previous", attachmentPath: "/task.png" } }, nextClaimAt: "2026-10-20T16:00:00.000Z" };
    await saveJournal(path, journal);
    expect(await loadJournal(path)).toEqual(journal);
    await writeFile(path, JSON.stringify({ ...journal, submitted: { task: { service: "SMS" } } }));
    await expect(loadJournal(path)).rejects.toThrow("Invalid delivery journal");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it.each(["{", "{}", '{"accepted":null,"completed":[]}', '{"accepted":[1],"completed":[]}', '{"accepted":[],"completed":[],"started":null}'])("日志损坏时停止发送而不是丢失去重状态: %s", async (contents) => {
  const directory = await mkdtemp(join(tmpdir(), "message-journal-"));
  try {
    const path = join(directory, "journal.json");
    await writeFile(path, contents);
    await expect(loadJournal(path)).rejects.toThrow();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
