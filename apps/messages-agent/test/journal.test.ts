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

it.each(["{", "{}", '{"accepted":null,"completed":[]}', '{"accepted":[1],"completed":[]}'])("日志损坏时停止发送而不是丢失去重状态: %s", async (contents) => {
  const directory = await mkdtemp(join(tmpdir(), "message-journal-"));
  try {
    const path = join(directory, "journal.json");
    await writeFile(path, contents);
    await expect(loadJournal(path)).rejects.toThrow();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
