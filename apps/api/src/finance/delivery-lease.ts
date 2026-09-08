import { ForbiddenException } from "@nestjs/common";

export function claimedDeliveryWhere(storeId: string, id: string, leaseToken: string) {
  return { id, storeId, status: "CLAIMED" as const, leaseToken, leaseExpiresAt: { gt: new Date() } };
}

export function requireDeliveryLease(changed: { count: number }) {
  if (changed.count !== 1) {
    throw new ForbiddenException({ code: "DELIVERY_LEASE_INVALID", messageZh: "发送任务租约无效或已经过期" });
  }
}
