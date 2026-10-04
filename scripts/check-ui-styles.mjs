import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(import.meta.dirname, "..");
const webRequire = createRequire(resolve(root, "apps/web/package.json"));
const postcss = webRequire(webRequire.resolve("postcss", {
  paths: [dirname(webRequire.resolve("next/package.json"))],
}));

// Check source styles in their real loading order, including rules inside media queries.
export const uiStyleFiles = ["globals.css", "design-system.css", "responsive.css"];
const frameProperties = new Set(["background", "background-color", "border", "border-color", "border-radius", "box-shadow"]);
const boardSurfaces = new Set([".gift-card-sales", ".lost-customers", ".add-employee-panel", ".board-empty-state"]);

export function checkUiStyles(sources) {
  const issues = [];
  for (const { name, css } of sources) {
    const styles = postcss.parse(css, { from: name });
    styles.walkDecls((declaration) => {
      const selector = declaration.parent.selector;
      if (selector === ":root") return;
      const location = `${name}:${declaration.source.start.line}`;
      if (/#[\da-f]{3,8}\b|rgba?\(/i.test(declaration.value)) {
        issues.push(`${location}: colors belong to :root tokens (${selector})`);
      }
      const radii = Array.from(declaration.value.matchAll(/\b(\d+(?:\.\d+)?)px\b/g), (match) => Number(match[1]));
      if (declaration.prop === "border-radius" && radii.some((radius) => radius >= 6 && radius !== 999)) {
        issues.push(`${location}: use a shared radius token (${selector})`);
      }
      if (selector?.split(",").some((part) => boardSurfaces.has(part.trim())) && frameProperties.has(declaration.prop)) {
        issues.push(`${location}: board frames belong to .board-panel (${selector})`);
      }
    });
  }
  return issues;
}

async function main() {
  const sources = await Promise.all(uiStyleFiles.map(async (name) => ({
    name,
    css: await readFile(resolve(root, "apps/web/app", name), "utf8"),
  })));
  const issues = checkUiStyles(sources);
  if (issues.length) throw new Error(`UI style consistency failed:\n${issues.join("\n")}`);
  console.log("UI 样式一致：颜色、圆角与记工面板使用共享规则；已检查全部断点。");
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
