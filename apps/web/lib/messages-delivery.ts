import type { ClosingDeliveryStatus, MessagesReceiptFields } from "./types";

type Delivery = MessagesReceiptFields & { status: ClosingDeliveryStatus; lastError?: string | null; lastErrorCode?: string | null; createdAt: string };

// Legacy SENT remains unconfirmed unless the Mac supplies an actual receipt.
export const messagesSubmittedLabel = "已提交·未确认送达";
export const messagesNeedsReviewLabel = "送达待核对";
export const messagesDeliveryNotice = "送达状态由 Mac 信息 App 同步。短信可能没有送达回执；重发前请在接收手机上核对。";

function hasUncertainResult(item: Delivery) {
  return item.status === "FAILED" && ["MESSAGES_DELIVERY_FAILED", "MESSAGES_RESULT_AMBIGUOUS", "DETAIL_RESULT_AMBIGUOUS"].includes(item.lastErrorCode ?? "");
}

export function messagesReceiptLabel(item: Delivery) {
  if (item.status !== "SENT" && item.status !== "FAILED") return null;
  if (item.deliveryStatus === "DELIVERED") return "已送达";
  if (item.deliveryStatus === "SENT") return "已发出·未确认送达";
  if (item.deliveryStatus === "FAILED" || hasUncertainResult(item)) return messagesNeedsReviewLabel;
  return null;
}

export function messagesStatusClass(item: Delivery) {
  if (messagesReceiptLabel(item)) {
    if (item.deliveryStatus === "DELIVERED") return "is-delivered";
    return "is-sent";
  }
  return `is-${item.status.toLowerCase()}`;
}

export function messagesReceiptError(item: Delivery) {
  if (item.deliveryStatus === "DELIVERED" || item.deliveryStatus === "SENT") return null;
  if (item.deliveryStatus === "FAILED") return `Mac 信息 App 返回错误 ${item.deliveryErrorCode ?? 0}，请在接收手机上核对。`;
  if (hasUncertainResult(item)) return "已开始发送，请在接收手机上核对。";
  return item.status === "SENT" ? null : item.lastError;
}

export function needsMessagesPolling(item: Delivery) {
  if (item.status === "QUEUED" || item.status === "CLAIMED") return true;
  return (item.status === "SENT" || item.status === "FAILED") && item.deliveryStatus !== "DELIVERED"
    && Date.now() - Date.parse(item.createdAt) <= 30 * 24 * 60 * 60_000;
}
