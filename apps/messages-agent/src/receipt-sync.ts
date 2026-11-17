import type { Journal } from "./journal.js";
import { messagesDeliveryState, messagesTextDeliveryState, taskMessagesPath } from "./stager.js";
import { agentErrorMessage } from "./errors.js";

interface ReceiptJob {
  id: string;
  attemptCount: number;
  recipientPhoneE164: string;
  deliveryMode?: "TEXT" | "IMAGE";
  deliveryMessageGuid?: string | null;
}
type Request = <T>(path: string, init?: RequestInit) => Promise<T>;

/** Reconcile only task metadata. This path never stages or sends attachments. */
export async function syncDeliveryReceipts(request: Request, journal: Journal) {
  for (const prefix of ["closing-delivery-agent", "employee-settlement-delivery-agent"]) {
    const jobs = await request<ReceiptJob[]>(`/${prefix}/jobs/receipts`);
    for (const job of jobs) {
      try {
        const fileName = prefix === "closing-delivery-agent" ? "closing.png" : "settlement-details.jpg";
        const submitted = journal.submitted?.[job.id];
        const isText = prefix === "closing-delivery-agent" && (submitted ? submitted.text === true : job.deliveryMode === "TEXT");
        let state = isText
          ? await messagesTextDeliveryState(job.recipientPhoneE164, job.id, job.deliveryMessageGuid ?? submitted?.observation?.messageGuid ?? undefined)
          : await messagesDeliveryState(job.recipientPhoneE164, taskMessagesPath(job.id, fileName));
        const previousGuid = submitted?.previousMessageGuid;
        if (state.messageGuid && state.messageGuid === previousGuid) state = { state: "MISSING", messageGuid: null, errorCode: 0, service: null };
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
