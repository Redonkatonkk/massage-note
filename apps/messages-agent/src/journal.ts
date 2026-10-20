import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { MessagesSubmission } from "./stager.js";

export interface Journal {
  accepted: string[]; completed: string[]; started?: string[];
  submitted?: Record<string, MessagesSubmission & { attachmentPath: string }>;
  nextClaimAt?: string;
}

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
  if (!value || typeof value !== "object" || !("accepted" in value) || !("completed" in value) || !validIds(value.accepted) || !validIds(value.completed)
    || ("started" in value && !validIds(value.started))
    || ("nextClaimAt" in value && (typeof value.nextClaimAt !== "string" || !Number.isFinite(Date.parse(value.nextClaimAt))))
    || ("submitted" in value && (!value.submitted || typeof value.submitted !== "object" || Array.isArray(value.submitted)
      || !Object.values(value.submitted).every(item => item && typeof item === "object" && typeof item.service === "string"
        && typeof item.attachmentPath === "string" && (item.previousMessageGuid === null || typeof item.previousMessageGuid === "string"))))) {
    throw new Error("Invalid delivery journal; restore the journal before sending to avoid duplicate messages");
  }
  return value as Journal;
}

export async function saveJournal(path: string, journal: Journal): Promise<void> {
  const temporaryPath = `${path}.tmp`;
  await writeFile(temporaryPath, JSON.stringify(journal), { encoding: "utf8", mode: 0o600 });
  await rename(temporaryPath, path);
}
