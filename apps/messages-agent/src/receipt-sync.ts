import type { Journal } from "./journal.js";
import { messagesDeliveryState, messagesTextDeliveryState, taskMessagesPath, type MessagesDeliveryState } from "./stager.js";
import { agentErrorMessage } from "./errors.js";

interface ReceiptJob {
  id: string;
  attemptCount: number;
  recipientPhoneE164: string;
  deliveryMode?: "TEXT" | "IMAGE";
  deliveryMessageGuid?: string | null;
  sendRound?: number;
}
type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

/** Reconcile only task metadata. This path never stages or sends attachments. */
export async function syncDeliveryReceipts(request: Request, journal: Journal, includeDispatch = false) {
  const queues = ["closing-delivery-agent", "employee-settlement-delivery-agent"];
  if (includeDispatch) queues.push("dispatch-sms-agent");
  for (const prefix of queues) {
    const jobs = await request<ReceiptJob[]>(`/${prefix}/jobs/receipts`);
    for (const job of jobs) {
      try {
        const fileName = prefix === "closing-delivery-agent" ? "closing.png" : "settlement-details.jpg";
        const submitted = journal.submitted?.[job.id];
        const resend = journal.resends?.[job.id];
        const isDispatch = prefix === "dispatch-sms-agent";
        const isText = prefix === "closing-delivery-agent" && (submitted ? submitted.text === true : job.deliveryMode === "TEXT");
        const missing: MessagesDeliveryState = { state: "MISSING", messageGuid: null, errorCode: 0, service: null };
        let state = missing;
        const previousGuid = submitted ? submitted.previousMessageGuid
          : isDispatch ? journal.dispatchBaselines?.[job.id] : resend?.previousMessageGuid;
        // A manual resend reuses the attachment path. Require the baseline for that round.
        if (!job.sendRound || (resend?.round === job.sendRound && resend.previousMessageGuid !== undefined)) {
          if (isDispatch) {
            const guid = job.deliveryMessageGuid ?? submitted?.observation?.messageGuid ?? undefined;
            if (guid || previousGuid !== undefined) {
              state = await messagesTextDeliveryState(job.recipientPhoneE164, job.id, guid, "dispatch");
              if (guid && state.state === "FAILED" && previousGuid !== undefined) {
                const latest = await messagesTextDeliveryState(job.recipientPhoneE164, job.id, undefined, "dispatch").catch(() => null);
                if (latest?.messageGuid !== previousGuid && (latest?.state === "SENT" || latest?.state === "DELIVERED")) state = latest;
              }
            }
          } else if (isText) {
            const guid = job.deliveryMessageGuid ?? submitted?.observation?.messageGuid ?? undefined;
            state = await messagesTextDeliveryState(job.recipientPhoneE164, job.id, guid);
            if (guid && state.state === "FAILED") {
              // A later Messages retry can have a different GUID for the same task link.
              const latest = await messagesTextDeliveryState(job.recipientPhoneE164, job.id).catch(() => null);
              if (latest?.messageGuid !== previousGuid && (latest?.state === "SENT" || latest?.state === "DELIVERED")) state = latest;
            }
          } else {
            state = await messagesDeliveryState(job.recipientPhoneE164, taskMessagesPath(job.id, fileName));
          }
        }
        if (state.messageGuid && state.messageGuid === previousGuid) state = missing;
        await request(`/${prefix}/jobs/${job.id}/receipt`, {
          method: "POST", body: JSON.stringify({ attemptCount: job.attemptCount, receipt: state }),
        });
      } catch (error) {
        // Other jobs can still reconcile when one attachment/status query fails.
        process.stderr.write(`receipt ${job.id}: ${agentErrorMessage(error)}\n`);
      }
    }
  }
}
