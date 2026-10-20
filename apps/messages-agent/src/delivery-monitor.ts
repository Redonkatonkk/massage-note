import { messagesDeliveryState, type MessagesDeliveryState } from "./stager.js";

export class MessagesDeliveryFailed extends Error {
  constructor(readonly errorCode: number) {
    super(`信息 App 确认发送失败（错误 ${errorCode}），等待 5 分钟后重试。`);
  }
}

/** Delivery receipt for iMessage/RCS; SMS may only provide a sent flag. */
export async function monitorMessagesDelivery(phone: string, path: string, previousMessageGuid: string | null) {
  const deadline = Date.now() + 120_000;
  let latest: MessagesDeliveryState | undefined;
  while (true) {
    latest = await messagesDeliveryState(phone, path);
    const currentAttempt = latest.messageGuid && latest.messageGuid !== previousMessageGuid;
    if (currentAttempt && latest.state === "FAILED") throw new MessagesDeliveryFailed(latest.errorCode);
    if (currentAttempt && latest.state === "DELIVERED") return latest;
    if (Date.now() >= deadline) {
      if (currentAttempt && latest.state === "SENT") return latest;
      throw new Error("信息 App 在 2 分钟内未确认发出或送达；结果待核对，不自动重发。");
    }
    await new Promise(resolve => setTimeout(resolve, 5_000));
  }
}
