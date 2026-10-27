import type { ClosingDeliveryReceiptInput, MessagesReceipt } from "@massage-note/contracts";
import type { Prisma } from "@massage-note/database";

export const clearDeliveryReceipt = {
  deliveryStatus: null, deliveryMessageGuid: null, deliveryErrorCode: null,
  deliveryService: null, deliveryCheckedAt: null,
};

export function deliveryReceiptData(receipt: MessagesReceipt | ClosingDeliveryReceiptInput["receipt"]) {
  return {
    deliveryStatus: receipt.state, deliveryMessageGuid: receipt.messageGuid,
    deliveryErrorCode: receipt.errorCode, deliveryService: receipt.service,
    deliveryCheckedAt: new Date(),
  };
}

// Only terminal sending tasks are observed. Polling never queues or sends a message.
export function receiptCandidatesWhere(storeId: string) {
  return {
    storeId, attemptCount: { gt: 0 },
    createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60_000) },
    AND: [
      { OR: [{ deliveryStatus: null }, { deliveryStatus: { not: "DELIVERED" } }] },
      { OR: [
        { status: "SENT" as const },
        { status: "FAILED" as const, lastErrorCode: { in: ["MESSAGES_RESULT_AMBIGUOUS", "DETAIL_RESULT_AMBIGUOUS", "MESSAGES_DELIVERY_FAILED"] } },
      ] },
    ],
  };
}

export const receiptCandidateSelect = {
  id: true, attemptCount: true, recipientPhoneE164: true,
} as const;

export const receiptCandidateOrder = [
  { deliveryCheckedAt: { sort: "asc", nulls: "first" } }, { id: "asc" },
] satisfies Prisma.EmployeeClosingDeliveryOrderByWithRelationInput[];

export async function recordDeliveryReceipt(
  transaction: Prisma.TransactionClient, kind: "closing" | "settlement", storeId: string,
  id: string, input: ClosingDeliveryReceiptInput,
) {
  const where = { ...receiptCandidatesWhere(storeId), id, attemptCount: input.attemptCount };
  const previous = kind === "closing"
    ? await transaction.employeeClosingDelivery.findFirst({ where })
    : await transaction.employeeSettlementDelivery.findFirst({ where });
  if (!previous) return { recorded: false };
  // Missing attachments or a transient pending flag do not erase a recorded result.
  const unavailable = ["MISSING", "PENDING"].includes(input.receipt.state);
  const data = unavailable && previous.deliveryMessageGuid
    ? { deliveryCheckedAt: new Date() }
    : deliveryReceiptData(input.receipt);
  const changed = kind === "closing"
    ? await transaction.employeeClosingDelivery.updateMany({ where, data })
    : await transaction.employeeSettlementDelivery.updateMany({ where, data });
  if (changed.count === 1 && "deliveryStatus" in data && (previous.deliveryStatus !== data.deliveryStatus
    || previous.deliveryMessageGuid !== data.deliveryMessageGuid || previous.deliveryErrorCode !== data.deliveryErrorCode)) {
    await transaction.auditLog.create({ data: {
      storeId, source: "messages_agent", action: `${kind === "closing" ? "employee_closing" : "employee_settlement"}.delivery_receipt`,
      entityType: kind === "closing" ? "employee_closing_delivery" : "employee_settlement_delivery", entityId: id,
      afterJson: { ...input.receipt, attemptCount: input.attemptCount }, requestId: `receipt:${id}:${input.attemptCount}`,
    } });
  }
  return { recorded: changed.count === 1 };
}
