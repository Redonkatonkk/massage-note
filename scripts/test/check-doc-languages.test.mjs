import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { checkDocumentLanguages } from "../check-doc-languages.mjs";

async function fixture(t, documents) {
  const root = await mkdtemp(join(tmpdir(), "massage-note-doc-languages-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [file, contents] of Object.entries(documents)) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), contents);
  }
  return checkDocumentLanguages(root, Object.keys(documents));
}

const en = "# Guide\n\n[简体中文](guide.zh-CN.md)\n\nEnglish instructions.\n\n## Setup\n\n```sh\npnpm dev\n```\n";
const zh = "# 指南\n\n[English](guide.md)\n\n中文说明。\n\n## 启动\n\n```sh\npnpm dev\n```\n";

test("accepts paired documents and preserves Chinese command examples", async t => {
  const result = await fixture(t, {
    "guide.md": en + "\nUse `使用此号码直接进入`.\n\n```text\n绑定 Lily\n```\n",
    "guide.zh-CN.md": zh,
  });
  assert.deepEqual(result, { errors: [], pairCount: 1 });
});

test("rejects missing companions and orphaned translations", async t => {
  const result = await fixture(t, { "guide.md": en, "other.zh-CN.md": zh });
  assert.equal(result.errors.length, 2);
  assert.match(result.errors.join("\n"), /missing Chinese document/);
  assert.match(result.errors.join("\n"), /missing English document/);
});

test("requires reciprocal language links at the top, not just a footer link", async t => {
  const result = await fixture(t, { "guide.md": en, "guide.zh-CN.md": zh.replace("[English](guide.md)", "") + "\n[English](guide.md)\n" });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /missing top-of-document language link/);
});

test("detects untranslated prose, missing sections, and divergent executable examples", async t => {
  const result = await fixture(t, {
    "guide.md": en + "\n尚未翻译的规则。\n",
    "guide.zh-CN.md": zh.replace("pnpm dev", "pnpm build") + "\n## 额外说明\n",
  });
  assert.equal(result.errors.length, 3);
  assert.match(result.errors.join("\n"), /untranslated Chinese prose/);
  assert.match(result.errors.join("\n"), /heading structure differs/);
  assert.match(result.errors.join("\n"), /executable examples differ/);
});

test("supports the plugin package's established Chinese README path", async t => {
  assert.deepEqual(await fixture(t, {
    "integrations/langbot-plugin/README.md": "# Plugin\n\n[简体中文](readme/README_zh_Hans.md)\n\nPlugin setup.\n",
    "integrations/langbot-plugin/readme/README_zh_Hans.md": "# 插件\n\n[English](../README.md)\n\n插件安装。\n",
  }), { errors: [], pairCount: 1 });
});
