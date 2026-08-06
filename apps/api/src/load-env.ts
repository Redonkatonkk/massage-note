import { loadEnvFile } from "node:process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectEnvPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../.env",
);

try {
  loadEnvFile(projectEnvPath);
} catch (error) {
  if (
    !(error instanceof Error) ||
    !("code" in error) ||
    error.code !== "ENOENT"
  ) {
    throw error;
  }
}
