// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { ClosingDeliveryQueue } from "./closing-delivery-queue";
import type { ClosingDeliveryList } from "../lib/types";
import { messagesDeliveryNotice, messagesSubmittedLabel } from "../lib/messages-delivery";
import { translateText } from "../lib/i18n";

it("旧 SENT 记录在桌面和手机均不宣称送达，并保留失败原因", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div"); const root = createRoot(container);
  const value = { deliveries: [
    { id: "submitted", status: "SENT", membership: { displayName: "Amy" }, kind: "INITIAL", locale: "zh_CN", closing: null, attemptCount: 1, recipientPhoneE164: "+13105551234", createdAt: "2026-10-20T15:00:00Z", sentAt: "2026-10-20T15:01:00Z", lastError: null },
    { id: "failed", status: "FAILED", membership: { displayName: "Bob" }, kind: "INITIAL", locale: "zh_CN", closing: null, attemptCount: 2, recipientPhoneE164: "+13105555678", createdAt: "2026-10-20T15:00:00Z", sentAt: null, lastError: "信息 App 确认发送失败" },
  ] } as unknown as ClosingDeliveryList;
  try {
    await act(async () => root.render(<ClosingDeliveryQueue value={value} busy={false} onCancel={() => {}} expanded />));
    expect(container.textContent).toContain(messagesDeliveryNotice);
    expect(container.querySelector("table")!.textContent).toContain(messagesSubmittedLabel);
    expect(container.querySelector(".mobile-data-list")!.textContent).toContain(messagesSubmittedLabel);
    expect(container.textContent).toContain("信息 App 确认发送失败");
    expect(container.textContent).not.toContain("发送成功");
    expect(translateText(messagesSubmittedLabel, "en-US")).toContain("unconfirmed");
    expect(translateText(messagesDeliveryNotice, "en-US")).toContain("actual status");
  } finally { await act(async () => root.unmount()); }
});

it("真实回执区分送达和 Mac 失败，手动重试后的送达清除旧失败提示", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement("div"); const root = createRoot(container);
  const base = { membership: { displayName: "Amy" }, kind: "INITIAL", locale: "zh_CN", closing: null, attemptCount: 1, recipientPhoneE164: "+13105551234", createdAt: "2026-10-26T15:00:00Z", sentAt: "2026-10-26T15:01:00Z", lastError: "old failure" };
  const value = { deliveries: [
    { ...base, id: "delivered", status: "FAILED", deliveryStatus: "DELIVERED" },
    { ...base, id: "failed", status: "SENT", deliveryStatus: "FAILED", deliveryErrorCode: 100 },
    { ...base, id: "sent", status: "SENT", deliveryStatus: "SENT" },
  ] } as unknown as ClosingDeliveryList;
  try {
    await act(async () => root.render(<ClosingDeliveryQueue value={value} busy={false} onCancel={() => {}} expanded />));
    for (const selector of ["table", ".mobile-data-list"]) {
      const view = container.querySelector(selector)!;
      expect(view.textContent).toContain("已送达");
      expect(view.textContent).toContain("Mac 报告未送达");
      expect(view.textContent).toContain("已发出·未确认送达");
      expect(view.textContent).toContain("错误 100");
      expect(view.textContent).not.toContain("old failure");
      expect(view.querySelector(".is-delivered")).not.toBeNull();
    }
  } finally { await act(async () => root.unmount()); }
});
