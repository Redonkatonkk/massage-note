import { expect, it } from "vitest";
import { STORE_BACKUP_MAX_BYTES } from "@massage-note/contracts";
import { validateBackup } from "../src/store-data/store-backup.js";

it("rejects oversized payloads and deeply nested values before schema traversal", () => {
  expect(() => validateBackup({ unexpected: "x".repeat(STORE_BACKUP_MAX_BYTES) })).toThrow("50 MiB");
  let nested: unknown = "leaf";
  for (let i = 0; i < 55; i++) nested = { child: nested };
  expect(() => validateBackup(nested)).toThrow("层级");
});
