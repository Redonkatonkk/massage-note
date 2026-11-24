import { messagesDeliveryState, messagesTextDeliveryState, type MessagesDeliveryState } from "./stager.js";

export class MessagesDeliveryFailed extends Error {
  constructor(readonly receipt: MessagesDeliveryState) {
    super(`Mac 信息 App 返回错误 ${receipt.errorCode}，送达待核对。`);
  }
}

/** Delivery receipt for iMessage/RCS; SMS may only provide a sent flag. */
export function monitorMessagesDelivery(phone: string, path: string, previousMessageGuid: string | null) {
  return monitor(() => messagesDeliveryState(phone, path), previousMessageGuid);
}

export function monitorMessagesTextDelivery(phone: string, jobId: string, previousMessageGuid: string | null, kind?: "dispatch") {
  return monitor(() => kind ? messagesTextDeliveryState(phone, jobId, undefined, kind) : messagesTextDeliveryState(phone, jobId), previousMessageGuid);
}

async function monitor(read: () => Promise<MessagesDeliveryState>, previousMessageGuid: string | null) {
  const deadline = Date.now() + 120_000;
  let latest: MessagesDeliveryState | undefined;
  let readError: unknown;
  while (true) {
    try {
      const observed = await read();
      if (observed.messageGuid && observed.messageGuid !== previousMessageGuid) latest = observed;
    } catch (error) {
      readError = error;
    }
    if (latest?.state === "DELIVERED") return latest;
    if (Date.now() >= deadline) {
      if (latest?.state === "SENT") return latest;
      if (latest?.state === "FAILED") throw new MessagesDeliveryFailed(latest);
      throw new Error("信息 App 在 2 分钟内未确认发出或送达；结果待核对。", { cause: readError });
    }
    await new Promise(resolve => setTimeout(resolve, 5_000));
  }
}
