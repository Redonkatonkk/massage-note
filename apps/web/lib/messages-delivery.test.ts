import { afterEach, expect, it, vi } from "vitest";
import { messagesNeedsReviewLabel, messagesReceiptError, messagesReceiptLabel, messagesStatusClass, needsMessagesPolling } from "./messages-delivery";
import { translateText } from "./i18n";

afterEach(() => vi.useRealTimers());
it("keeps recent sent/failed tasks polling until delivery, without reviving cancelled or old tasks", () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
  const item = { status: "SENT" as const, createdAt: "2026-10-25T12:00:00Z" };
  expect(needsMessagesPolling(item)).toBe(true);
  expect(needsMessagesPolling({ ...item, status: "FAILED" })).toBe(true);
  expect(needsMessagesPolling({ ...item, deliveryStatus: "DELIVERED" })).toBe(false);
  expect(needsMessagesPolling({ ...item, status: "CANCELLED" })).toBe(false);
  expect(needsMessagesPolling({ ...item, createdAt: "2026-09-01T12:00:00Z" })).toBe(false);
  expect(messagesReceiptLabel({ ...item, status: "QUEUED", deliveryStatus: "DELIVERED" })).toBeNull();
  expect(messagesReceiptError({ ...item, lastError: "obsolete failure" })).toBeNull();
  const macError = { ...item, deliveryStatus: "FAILED" as const, deliveryErrorCode: 100 };
  expect(messagesReceiptLabel(macError)).toBe(messagesNeedsReviewLabel);
  expect(messagesStatusClass(macError)).toBe("is-sent");
  expect(translateText(messagesNeedsReviewLabel, "en-US")).toBe("Check delivery");
  expect(translateText(messagesReceiptError(macError)!, "en-US")).toContain("error 100");
});
