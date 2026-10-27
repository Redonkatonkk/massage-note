import { expect, it } from "vitest";
import { closingDeliveryCompleteSchema, closingDeliveryReceiptSchema } from "../src/closing-delivery.js";

const receipt = { messageGuid: "message", state: "DELIVERED", errorCode: 0, service: "RCS" };
const leaseToken = "00000000-0000-4000-8000-000000000001";
it("accepts legacy completion and actual receipts, rejecting contradictory success", () => {
  expect(closingDeliveryCompleteSchema.safeParse({ leaseToken }).success).toBe(true);
  expect(closingDeliveryCompleteSchema.safeParse({ leaseToken, receipt }).success).toBe(true);
  expect(closingDeliveryCompleteSchema.safeParse({ leaseToken, receipt: { ...receipt, errorCode: 100 } }).success).toBe(false);
  expect(closingDeliveryCompleteSchema.safeParse({ leaseToken, receipt: { ...receipt, state: "FAILED", errorCode: 100 } }).success).toBe(false);
});
it("requires an attempt and a consistent task observation", () => {
  expect(closingDeliveryReceiptSchema.safeParse({ attemptCount: 1, receipt }).success).toBe(true);
  expect(closingDeliveryReceiptSchema.safeParse({ attemptCount: 0, receipt }).success).toBe(false);
  expect(closingDeliveryReceiptSchema.safeParse({ attemptCount: 1, receipt: { ...receipt, state: "FAILED" } }).success).toBe(false);
  expect(closingDeliveryReceiptSchema.safeParse({ attemptCount: 1, receipt: { ...receipt, state: "MISSING", messageGuid: null } }).success).toBe(true);
});
