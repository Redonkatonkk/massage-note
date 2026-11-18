import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { checkDocumentLinks, localDocumentLinks, repositoryMarkdownFiles } from "../check-doc-links.mjs";

test("checks inline links, images, reference destinations and encoded paths", () => {
  const markdown = [
    '[guide](../guide.md#setup "Title")',
    '![image](./image.png)',
    '[space](<../My Guide.md>)',
    '[encoded](../My%20Guide.md?download=1#title)',
    '[reference]: ../reference.md "Title"',
  ].join("\n");
  assert.deepEqual(localDocumentLinks(markdown), [
    "../guide.md", "./image.png", "../My Guide.md", "../My Guide.md", "../reference.md",
  ]);
});

test("skips external URLs and same-document anchors", () => {
  assert.deepEqual(localDocumentLinks([
    "[web](https://example.com/guide)", "[protocol relative](//example.com/guide)",
    "[mail](mailto:example@example.com)", "[anchor](#setup)",
  ].join("\n")), []);
});

test("ignores code examples and keeps links with code-formatted labels", () => {
  const markdown = [
    "```md", "[example](missing.md)", "```", "~~~text", "[example](also-missing.md)", "~~~",
    "`[inline](missing.md)`", "[`guide.md`](guide.md)",
  ].join("\n");
  assert.deepEqual(localDocumentLinks(markdown), ["guide.md"]);
});

test("resolves targets relative to each document and reports missing files", async t => {
  const root = await mkdtemp(join(tmpdir(), "massage-note-doc-links-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "docs"));
  await writeFile(join(root, "README.md"), "# Project");
  await writeFile(join(root, "docs", "guide.md"), "[root](../README.md)\n[folder](./)\n[root relative](/README.md)\n[missing](missing.md)");
  assert.deepEqual(await checkDocumentLinks(root, ["docs/guide.md"]), {
    linkCount: 4, errors: ["docs/guide.md: missing.md"],
  });
});

test("checks active Markdown files after a local deletion and flags surviving links to it", async t => {
  const root = await mkdtemp(join(tmpdir(), "massage-note-doc-links-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd: root });
  git("init", "--quiet");
  await writeFile(join(root, "old.md"), "# Old");
  git("add", "old.md");
  await rm(join(root, "old.md"));
  await writeFile(join(root, "new.md"), "[old](old.md)");
  const files = repositoryMarkdownFiles(root);
  assert.deepEqual(files, ["new.md"]);
  assert.deepEqual(await checkDocumentLinks(root, files), { errors: ["new.md: old.md"], linkCount: 1 });
});
