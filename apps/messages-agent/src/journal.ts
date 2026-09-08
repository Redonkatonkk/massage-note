import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface Journal { accepted: string[]; completed: string[] }

export async function loadJournal(path: string): Promise<Journal> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { accepted: [], completed: [] };
    throw error;
  }
  const value: unknown = JSON.parse(raw);
  const validIds = (ids: unknown): ids is string[] => Array.isArray(ids) && ids.every(id => typeof id === "string" && id.length > 0);
  if (!value || typeof value !== "object" || !("accepted" in value) || !("completed" in value) || !validIds(value.accepted) || !validIds(value.completed)) {
    throw new Error("Invalid delivery journal; restore the journal before sending to avoid duplicate messages");
  }
  return { accepted: value.accepted, completed: value.completed };
}

export async function saveJournal(path: string, journal: Journal): Promise<void> {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(journal), { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, path);
}
