import { mkdir, mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { cleanupOutbox, closingPngPath, OUTBOX_RETENTION_MS, prepareOutbox, secureClosingPng } from "../src/outbox.js";

describe("Messages attachment outbox", () => {
  it("使用受限目录与文件权限", async () => {
    const directory = await mkdtemp(join(tmpdir(), "messages-outbox-test-"));
    try {
      const outbox = await prepareOutbox(directory);
      const path = closingPngPath(outbox, "00000000-0000-4000-8000-000000000001");
      await writeFile(path, "png");
      await secureClosingPng(path);
      expect((await stat(outbox)).mode & 0o777).toBe(0o700);
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      expect(await readFile(path, "utf8")).toBe("png");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("只清理超过 30 分钟的任务 PNG", async () => {
    const directory = await mkdtemp(join(tmpdir(), "messages-outbox-cleanup-test-"));
    try {
      const outbox = await prepareOutbox(directory);
      const oldPath = closingPngPath(outbox, "00000000-0000-4000-8000-000000000002");
      const freshPath = closingPngPath(outbox, "00000000-0000-4000-8000-000000000003");
      const unrelated = join(outbox, "keep.txt");
      await Promise.all([writeFile(oldPath, "old"), writeFile(freshPath, "fresh"), writeFile(unrelated, "keep")]);
      const now = Date.now();
      await utimes(oldPath, new Date(now - OUTBOX_RETENTION_MS - 1_000), new Date(now - OUTBOX_RETENTION_MS - 1_000));
      expect(await cleanupOutbox(outbox, now)).toBe(1);
      await expect(stat(oldPath)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(stat(freshPath)).resolves.toBeDefined();
      await expect(stat(unrelated)).resolves.toBeDefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("拒绝把非任务 ID 拼接进 outbox 路径", async () => {
    const directory = await mkdtemp(join(tmpdir(), "messages-outbox-path-test-"));
    try {
      await mkdir(join(directory, "outbox"));
      expect(() => closingPngPath(join(directory, "outbox"), "../secret")).toThrow("invalid closing delivery job id");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
