import { BadRequestException } from "@nestjs/common";
import type { DispatchSmsSettings } from "@massage-note/contracts";
import type { Prisma, Store } from "@massage-note/database";
import { firstDispatchDate } from "../common/dispatch-sms-time.js";

export const dispatchSmsSettingsSelect = { enabled: true, sendTimeLocal: true, phoneE164: true } as const;

export async function updateDispatchSmsSettings(
  transaction: Prisma.TransactionClient,
  previousStore: Store,
  store: Store,
  input: DispatchSmsSettings | undefined,
  actor: { userId: string; membershipId: string; requestId: string },
) {
  if (input?.enabled && !store.automaticDispatchEnabled) {
    throw new BadRequestException({
      code: "DISPATCH_SMS_RANKING_DISABLED", messageZh: "请先开启每日开门排位，再开启排工短信",
    });
  }
  if (input === undefined && store.automaticDispatchEnabled === previousStore.automaticDispatchEnabled && store.timezone === previousStore.timezone) return;

  const where = { storeId: store.id };
  const previous = await transaction.dispatchSmsSettings.findUnique({ where, select: dispatchSmsSettingsSelect });
  const requested = input ?? previous;
  if (!requested) return;
  const next = { ...requested, enabled: requested.enabled && store.automaticDispatchEnabled };
  if (previous?.enabled === next.enabled && previous.sendTimeLocal === next.sendTimeLocal &&
      previous.phoneE164 === next.phoneE164 && (!next.enabled || store.timezone === previousStore.timezone)) return;
  const startOnDate = next.enabled ? firstDispatchDate(new Date(), store.timezone, next.sendTimeLocal) : null;
  const data = { ...next, startOnDate };
  await transaction.dispatchSmsSettings.upsert({ where, create: { ...where, ...data }, update: data });
  await transaction.dispatchSmsDelivery.updateMany({
    where: { ...where, status: { in: ["QUEUED", "CLAIMED"] }, dispatchStartedAt: null },
    data: { status: "CANCELLED", lastErrorCode: "SETTINGS_CHANGED", leaseToken: null, leaseExpiresAt: null },
  });
  await transaction.auditLog.create({
    data: {
      storeId: store.id, actorUserId: actor.userId, actorMembershipId: actor.membershipId, source: "api",
      action: "dispatch_sms.settings_updated", entityType: "store", entityId: store.id, requestId: actor.requestId,
      afterJson: { enabled: next.enabled, sendTimeLocal: next.sendTimeLocal, recipientChanged: next.phoneE164 !== previous?.phoneE164 },
    },
  });
}
