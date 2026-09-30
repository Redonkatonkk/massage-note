import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function withoutCode(markdown) {
  let fence = null;
  return markdown.split("\n").map(line => {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      return "";
    }
    if (marker) {
      fence = marker[1];
      return "";
    }
    return line.replace(/(`+)[^\n]*?\1/g, "");
  }).join("\n");
}

/** Inline links/images and reference destinations; external URLs are skipped. */
export function localDocumentLinks(markdown) {
  const contents = withoutCode(markdown);
  const inline = /!?\[[^\]\n]*\]\(\s*(?:<([^>\n]+)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
  const references = /^ {0,3}\[[^\]\n]+\]:\s*(?:<([^>\n]+)>|(\S+))/gm;
  return [...contents.matchAll(inline), ...contents.matchAll(references)]
    .map(match => match[1] ?? match[2])
    .filter(target => !/^[a-z][\w+.-]*:|^\/\//i.test(target))
    .map(target => target.split(/[?#]/, 1)[0])
    .filter(Boolean)
    .map(decodeURIComponent);
}

export async function checkDocumentLinks(root, files) {
  const errors = [];
  let linkCount = 0;
  for (const file of files) {
    const document = resolve(root, file);
    const links = localDocumentLinks(await readFile(document, "utf8"));
    for (const target of links) {
      linkCount += 1;
      const destination = target.startsWith("/")
        ? resolve(root, `.${target}`)
        : resolve(document, "..", target);
      try {
        await access(destination);
      } catch {
        errors.push(`${file}: ${target}`);
      }
    }
  }
  return { errors, linkCount };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = resolve(import.meta.dirname, "..");
  const output = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "*.md"], { cwd: root, encoding: "utf8" });
  const files = [...new Set(output.split("\0").filter(Boolean))];
  const { errors, linkCount } = await checkDocumentLinks(root, files);
  if (errors.length) {
    console.error(`本地文档链接失效：\n${errors.join("\n")}`);
    process.exitCode = 1;
  } else {
    console.log(`本地文档链接有效：${files.length} 份 Markdown，${linkCount} 个文件/目录目标。`);
  }
}
