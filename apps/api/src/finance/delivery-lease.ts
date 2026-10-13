import { ForbiddenException } from "@nestjs/common";
import type { ClosingDeliveryFailureInput } from "@massage-note/contracts";

export function claimedDeliveryWhere(storeId: string, id: string, leaseToken: string) {
  return { id, storeId, status: "CLAIMED" as const, leaseToken, leaseExpiresAt: { gt: new Date() } };
}

export function requireDeliveryLease(changed: { count: number }) {
  if (changed.count !== 1) {
    throw new ForbiddenException({ code: "DELIVERY_LEASE_INVALID", messageZh: "发送任务租约无效或已经过期" });
  }
}

export function deliveryFailureState(attemptCount: number, input: ClosingDeliveryFailureInput) {
  // attemptCount includes the initial attempt: allow three additional retries.
  const retryScheduled = input.retryable && attemptCount < 4;
  return {
    retryScheduled,
    data: {
      status: retryScheduled ? "QUEUED" as const : "FAILED" as const,
      leaseToken: null,
      leaseExpiresAt: null,
      nextAttemptAt: retryScheduled ? new Date(Date.now() + 60_000) : new Date(),
      lastErrorCode: input.code,
      lastError: input.message,
    },
  };
}
