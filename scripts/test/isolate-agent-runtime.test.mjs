import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, link, lstat, mkdir, mkdtemp, readFile, readlink, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { isolateAgentRuntime } from "../isolate-agent-runtime.mjs";

test("workspace rebuilds cannot change the installed dependency graph", async t => {
  const root = await mkdtemp(join(tmpdir(), "messages-agent-isolation-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const workspace = join(root, "workspace");
  const installed = join(root, "app");
  const dependency = join(installed, "node_modules/.pnpm/domain");
  await mkdir(workspace);
  await mkdir(dependency, { recursive: true });
  await writeFile(join(workspace, "index.mjs"), 'export { value } from "./existing.mjs";');
  await writeFile(join(workspace, "existing.mjs"), 'export const value = "installed";');
  for (const name of ["index.mjs", "existing.mjs"]) {
    await link(join(workspace, name), join(dependency, name));
  }
  await symlink(".pnpm/domain", join(installed, "node_modules/domain"));
  assert.equal(await isolateAgentRuntime(installed), 2);
  // Reproduce the original failure: tsc updates the index and adds a new module.
  await writeFile(join(workspace, "index.mjs"), 'export { value } from "./cash-balance.mjs";');
  await writeFile(join(workspace, "cash-balance.mjs"), 'export const value = "rebuilt";');
  const entry = pathToFileURL(join(installed, "node_modules/domain/index.mjs")).href;
  assert.equal(execFileSync(process.execPath, ["--input-type=module", "-e", `console.log((await import(${JSON.stringify(entry)})).value)`], { encoding: "utf8" }).trim(), "installed");
  assert.equal(await readlink(join(installed, "node_modules/domain")), ".pnpm/domain");
  assert.equal(await isolateAgentRuntime(installed), 0);
});

test("preserves executable permissions and never follows external symlinks", async t => {
  const root = await mkdtemp(join(tmpdir(), "messages-agent-links-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const installed = join(root, "app");
  const source = join(root, "source");
  await mkdir(installed);
  await writeFile(source, "original");
  await chmod(source, 0o750);
  await link(source, join(installed, "executable"));
  await symlink(source, join(installed, "external"));
  assert.equal(await isolateAgentRuntime(installed), 1);
  assert.equal((await lstat(join(installed, "executable"))).mode & 0o777, 0o750);
  await writeFile(source, "changed");
  assert.equal(await readFile(join(installed, "executable"), "utf8"), "original");
  assert.equal(await readFile(join(installed, "external"), "utf8"), "changed");
  assert.equal((await lstat(source)).nlink, 1);
});
