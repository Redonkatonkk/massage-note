import { expect, it } from "vitest";
import { storeImportConfirmSchema, storeImportPreviewSchema } from "../src/store-data.js";

it("rejects deeply nested uploads before traversing the backup JSON schema", () => {
  let backup: unknown = "sensitive text";
  for (let i = 0; i < 2000; i++) backup = { child: backup };
  expect(storeImportPreviewSchema.safeParse({ backup }).success).toBe(false);
  expect(storeImportConfirmSchema.safeParse({ backup, previewId: "10000000-0000-4000-8000-000000000001", confirmName: "Store" }).success).toBe(false);
});
