import { ForbiddenException } from "@nestjs/common";
import type { ClosingDeliveryFailureInput } from "@massage-note/contracts";
import { deliveryReceiptData } from "./delivery-receipt.js";

export function claimedDeliveryWhere(storeId: string, id: string, leaseToken: string) {
  return { id, storeId, status: "CLAIMED" as const, leaseToken, leaseExpiresAt: { gt: new Date() } };
}

export function requireDeliveryLease(changed: { count: number }) {
  if (changed.count !== 1) {
    throw new ForbiddenException({ code: "DELIVERY_LEASE_INVALID", messageZh: "发送任务租约无效或已经过期" });
  }
}

export function dispatchCheckpointWhere(storeId: string, id: string, leaseToken: string) {
  return { ...claimedDeliveryWhere(storeId, id, leaseToken), dispatchStartedAt: null };
}

export function deliveryFailureState(job: { attemptCount: number; dispatchStartedAt: Date | null }, input: ClosingDeliveryFailureInput) {
  // attemptCount includes the initial attempt: allow three additional retries.
  const checkpointUncertain = job.dispatchStartedAt && input.code === "PRE_SEND_FAILURE";
  const retryScheduled = !job.dispatchStartedAt && input.code === "PRE_SEND_FAILURE" && input.retryable === true && job.attemptCount < 4;
  return {
    retryScheduled,
    data: {
      ...(input.receipt && !retryScheduled ? deliveryReceiptData(input.receipt) : {}),
      status: retryScheduled ? "QUEUED" as const : "FAILED" as const,
      leaseToken: null,
      leaseExpiresAt: null,
      nextAttemptAt: retryScheduled ? new Date(Date.now() + 60_000) : new Date(),
      lastErrorCode: checkpointUncertain ? "MESSAGES_RESULT_AMBIGUOUS" : input.code,
      lastError: input.message,
    },
  };
}
