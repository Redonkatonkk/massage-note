import type { ClosingDeliveryStatus, MessagesReceiptFields } from "./types";

type Delivery = MessagesReceiptFields & { status: ClosingDeliveryStatus; lastError?: string | null; createdAt: string };

// Legacy SENT remains unconfirmed unless the Mac supplies an actual receipt.
export const messagesSubmittedLabel = "已提交·未确认送达";
export const messagesDeliveryNotice = "送达状态由 Mac 信息 App 同步，手动重试后会继续核对。短信可能没有送达回执；若手机与 Mac 状态不同，请核对后再重发。";

export function messagesReceiptLabel(item: Delivery) {
  if (item.status !== "SENT" && item.status !== "FAILED") return null;
  if (item.deliveryStatus === "DELIVERED") return "已送达";
  if (item.deliveryStatus === "FAILED") return "Mac 报告未送达";
  if (item.deliveryStatus === "SENT") return "已发出·未确认送达";
  return null;
}

export function messagesStatusClass(item: Delivery) {
  if (messagesReceiptLabel(item)) {
    if (item.deliveryStatus === "DELIVERED") return "is-delivered";
    if (item.deliveryStatus === "FAILED") return "is-failed";
    return "is-sent";
  }
  return `is-${item.status.toLowerCase()}`;
}

export function messagesReceiptError(item: Delivery) {
  if (item.deliveryStatus === "DELIVERED" || item.deliveryStatus === "SENT") return null;
  return item.deliveryStatus === "FAILED" ? `信息 App 报告未送达（错误 ${item.deliveryErrorCode ?? 0}），请核对后再重发。` : item.lastError;
}

export function needsMessagesPolling(item: Delivery) {
  if (item.status === "QUEUED" || item.status === "CLAIMED") return true;
  return (item.status === "SENT" || item.status === "FAILED") && item.deliveryStatus !== "DELIVERED"
    && Date.now() - Date.parse(item.createdAt) <= 30 * 24 * 60 * 60_000;
}
