import { afterEach, expect, it, vi } from "vitest";
import { messagesReceiptError, messagesReceiptLabel, needsMessagesPolling } from "./messages-delivery";
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
  expect(translateText("Mac 报告未送达", "en-US")).toBe("Mac reports not delivered");
  expect(translateText("信息 App 报告未送达（错误 100），请核对后再重发。", "en-US")).toContain("error 100");
});
