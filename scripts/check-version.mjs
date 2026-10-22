import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const expected = (await readFile(resolve(root, "VERSION"), "utf8")).trim();
const packageFiles = [
  "package.json",
  "apps/api/package.json",
  "apps/web/package.json",
  "apps/messages-agent/package.json",
  "packages/contracts/package.json",
  "packages/database/package.json",
  "packages/domain/package.json",
];

if (!/^\d+\.\d+\.\d+$/.test(expected)) {
  throw new Error(`VERSION 必须是语义化版本号，当前为 ${JSON.stringify(expected)}`);
}

const mismatches = [];
for (const file of packageFiles) {
  const value = JSON.parse(await readFile(resolve(root, file), "utf8"));
  if (value.version !== expected) mismatches.push(`${file}: ${value.version ?? "未设置"}`);
}

const versionedFiles = [
  ["Dockerfile", `ARG APP_VERSION=${expected}`],
  ["docker-compose.nas.yml", `MASSAGE_NOTE_IMAGE_TAG:-${expected}`],
  [".env.nas.example", `MASSAGE_NOTE_IMAGE_TAG=${expected}`],
  ["README.md", `Current version: \`${expected}\``],
  ["README.zh-CN.md", `当前版本：\`${expected}\``],
  ["docs/product/PRODUCT.md", `Applies to version: \`${expected}\``],
  ["docs/product/PRODUCT.zh-CN.md", `适用版本：\`${expected}\``],
  ["docs/engineering/ARCHITECTURE.md", `Verified against version: \`${expected}\``],
  ["docs/engineering/ARCHITECTURE.zh-CN.md", `与 \`${expected}\` 代码结构核对`],
  ["docs/engineering/DEVELOPMENT.md", `Applies to version: \`${expected}\``],
  ["docs/engineering/DEVELOPMENT.zh-CN.md", `适用版本：\`${expected}\``],
  ["docs/engineering/AI_HANDOFF.md", `Current version: \`${expected}\``],
  ["docs/engineering/AI_HANDOFF.zh-CN.md", `当前版本：\`${expected}\``],
  ["docs/engineering/API.md", `Applies to version: \`${expected}\``],
  ["docs/engineering/API.zh-CN.md", `适用版本：\`${expected}\``],
  ["docs/engineering/UI_DESIGN.md", `Applies to version: \`${expected}\``],
  ["docs/engineering/UI_DESIGN.zh-CN.md", `适用版本：\`${expected}\``],
  ["docs/operations/NAS_DEPLOYMENT.md", `Current version: \`${expected}\``],
  ["docs/operations/NAS_DEPLOYMENT.zh-CN.md", `当前版本：\`${expected}\``],
  ["CHANGELOG.md", `## ${expected}`],
  ["CHANGELOG.zh-CN.md", `## ${expected}`],
];
for (const [file, marker] of versionedFiles) {
  const contents = await readFile(resolve(root, file), "utf8");
  if (!contents.includes(marker)) mismatches.push(`${file}: 缺少 ${marker}`);
}

if (mismatches.length > 0) {
  throw new Error(`版本必须统一为 ${expected}：\n${mismatches.join("\n")}`);
}

console.log(`Massage note 版本一致：${expected}`);
