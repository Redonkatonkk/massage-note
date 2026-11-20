import { createHash } from "node:crypto";
import { z } from "zod";
import { workBotParsedIntentSchema } from "@massage-note/contracts";

export const workBotReviewMs = 10 * 60_000;
export const previewOutcome = "CONFIRMATION_REQUIRED";

export interface WorkBotActionReview {
  summary: string;
  fingerprint: string;
  sensitive: boolean;
}

export const workBotPreviewSchema = z.object({
  code: z.string(),
  expiresAt: z.number(),
  intent: workBotParsedIntentSchema,
  evidenceText: z.string(),
  occurredAt: z.string(),
  scope: z.string(),
  fingerprints: z.array(z.string()),
});

export function workBotFingerprint(value: unknown): string {
  const canonical = JSON.stringify(value, (_key, field) => {
    if (typeof field === "bigint") return field.toString();
    if (field !== null && typeof field === "object" && !Array.isArray(field)) {
      return Object.fromEntries(Object.entries(field).sort(([a], [b]) => a.localeCompare(b)));
    }
    return field;
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export function workBotConfirmation(raw: string) {
  const text = raw.normalize("NFKC").replace(/^[@＠][^\s]+\s+/u, "").trim();
  const match = /^(确认|取消|confirm|cancel)\s+([0-9a-f]{8})[。！!]?$/iu.exec(text);
  return match ? { confirm: /^(确认|confirm)$/iu.test(match[1]!), code: match[2]!.toUpperCase() } : null;
}
