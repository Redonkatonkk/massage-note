import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const basePath = process.env.DEMO_BASE_PATH ?? "/massage-note";
if (basePath && !/^\/[A-Za-z0-9_-]+$/.test(basePath)) throw new Error("DEMO_BASE_PATH must be empty or a single /path segment.");
// Build a clean source copy without .env, so the running dev server and its
// generated route types are unaffected. Webpack supports workspace symlinks.
const scratch = mkdtempSync(resolve(tmpdir(), "massage-note-demo-"));
try {
  mkdirSync(resolve(scratch, "apps/web"), { recursive: true });
  cpSync(resolve(root, "apps/web"), resolve(scratch, "apps/web"), {
    recursive: true,
    filter: source => !["node_modules", ".next", ".next-demo", "out"].includes(source.split("/").at(-1)) && !source.endsWith(".tsbuildinfo"),
  });
  for (const file of ["package.json", "tsconfig.base.json"]) cpSync(resolve(root, file), resolve(scratch, file));
  for (const directory of ["node_modules", "packages", "apps/web/node_modules"]) symlinkSync(resolve(root, directory), resolve(scratch, directory), "dir");
  execFileSync("pnpm", ["exec", "next", "build", "--webpack"], {
    cwd: resolve(scratch, "apps/web"), stdio: "inherit",
    env: { ...process.env, NEXT_PUBLIC_PORTFOLIO_DEMO: "true", NEXT_PUBLIC_APP_BASE_PATH: basePath, NEXT_PUBLIC_DEV_AUTH_ENABLED: "false" },
  });
  const output = resolve(root, "apps/web/out");
  rmSync(output, { recursive: true, force: true });
  cpSync(resolve(scratch, "apps/web/.next-demo"), output, { recursive: true });
  writeFileSync(resolve(output, ".nojekyll"), "");
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
console.log(`Static portfolio demo: apps/web/out (base path: ${basePath || "/"})`);
