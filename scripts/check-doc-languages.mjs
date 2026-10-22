import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { localDocumentLinks } from "./check-doc-links.mjs";

const pluginEnglish = "integrations/langbot-plugin/README.md";
const pluginChinese = "integrations/langbot-plugin/readme/README_zh_Hans.md";
const chinese = /[\u3400-\u9fff]/u;

function content(markdown) {
  const prose = [];
  const headings = [];
  const examples = [];
  let fence = null;
  let example = [];
  let language = "";
  for (const line of markdown.split("\n")) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) {
        if (!["text", "mermaid"].includes(language)) examples.push([language, example.join("\n")]);
        fence = null;
      } else example.push(line);
      continue;
    }
    if (marker) {
      fence = marker[1]; language = marker[2].trim(); example = [];
      continue;
    }
    const heading = /^(#{1,6})\s/.exec(line);
    if (heading) headings.push(heading[1].length);
    prose.push(line.replace(/(`+)[^\n]*?\1/g, "").replace(/!?\[[^\]\n]*\]\([^\n)]*\)/g, "").replace(/<[^>]*>/g, ""));
  }
  return { prose: prose.join("\n"), headings, examples };
}

/** Structural checks complement translation review; they cannot prove semantic equivalence. */
export async function checkDocumentLanguages(root, files) {
  const available = new Set(files);
  const errors = [];
  let pairCount = 0;
  for (const file of files) {
    if (file.endsWith(".zh-CN.md") || file === pluginChinese) {
      const english = file === pluginChinese ? pluginEnglish : file.replace(/\.zh-CN\.md$/, ".md");
      if (!available.has(english)) errors.push(`${file}: missing English document ${english}`);
      continue;
    }
    const companion = file === pluginEnglish ? pluginChinese : file.replace(/\.md$/, ".zh-CN.md");
    if (!available.has(companion)) {
      errors.push(`${file}: missing Chinese document ${companion}`);
      continue;
    }
    pairCount += 1;
    const english = await readFile(resolve(root, file), "utf8");
    const translated = await readFile(resolve(root, companion), "utf8");
    for (const [source, target, markdown] of [[file, companion, english], [companion, file, translated]]) {
      const links = localDocumentLinks(markdown.split("\n").slice(0, 8).join("\n"));
      if (!links.some(link => resolve(root, dirname(source), link) === resolve(root, target))) {
        errors.push(`${source}: missing top-of-document language link to ${target}`);
      }
    }
    const en = content(english);
    const zh = content(translated);
    if (chinese.test(en.prose)) errors.push(`${file}: untranslated Chinese prose outside examples, code, and links`);
    if (!/[A-Za-z]{3,}/.test(en.prose)) errors.push(`${file}: missing English prose`);
    if (!chinese.test(zh.prose)) errors.push(`${companion}: missing Chinese prose`);
    if (JSON.stringify(en.headings) !== JSON.stringify(zh.headings)) errors.push(`${file}: heading structure differs from ${companion}`);
    if (JSON.stringify(en.examples) !== JSON.stringify(zh.examples)) errors.push(`${file}: executable examples differ from ${companion}`);
  }
  return { errors, pairCount };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, "..");
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "*.md"], { cwd: root, encoding: "utf8" });
  const files = [...new Set(output.split("\0").filter(Boolean))];
  const { errors, pairCount } = await checkDocumentLanguages(root, files);
  if (errors.length) {
    console.error(`Bilingual documentation checks failed:\n${errors.join("\n")}`);
    process.exitCode = 1;
  } else console.log(`Bilingual documentation structure valid: ${pairCount} English/Chinese pairs.`);
}
