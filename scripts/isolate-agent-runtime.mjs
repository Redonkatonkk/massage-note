import { randomUUID } from "node:crypto";
import { copyFile, lstat, readdir, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

// pnpm legacy deploy may hardlink workspace outputs into the installed runtime.
// A later tsc build overwrites those files in place without adding new modules.
export async function isolateAgentRuntime(directory) {
  let detached = 0;
  async function visit(path) {
    const info = await lstat(path);
    if (info.isDirectory()) {
      for (const name of await readdir(path)) await visit(join(path, name));
    } else if (info.isFile() && info.nlink > 1) {
      const temporary = `${path}.${randomUUID()}.copy`;
      try {
        await copyFile(path, temporary);
        await rename(temporary, path);
        detached += 1;
      } finally {
        await rm(temporary, { force: true });
      }
    }
    // Keep package symlinks intact; never follow them outside the installation.
  }
  await visit(directory);
  return detached;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (!process.argv[2]) throw new Error("Usage: node scripts/isolate-agent-runtime.mjs <installation-directory>");
  const detached = await isolateAgentRuntime(resolve(process.argv[2]));
  console.log(`Isolated agent runtime: ${detached} hardlinked files copied`);
}
