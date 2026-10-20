import { monitorMessagesDelivery } from "./delivery-monitor.js";
import type { Journal } from "./journal.js";
import { sendMessagesAttachment } from "./messages.js";

export async function submitAndConfirmMessages(
  jobId: string, phone: string, path: string, kind: "IMAGE" | "CONVERSATION_IMAGE",
  journal: Journal, save: () => Promise<void>,
) {
  let submission = journal.submitted?.[jobId];
  if (!submission) {
    if (!journal.started?.includes(jobId)) (journal.started ??= []).push(jobId);
    await save();
    const result = await sendMessagesAttachment(phone, path, kind);
    submission = { ...result, attachmentPath: path };
    (journal.submitted ??= {})[jobId] = submission;
    await save();
  }
  const state = await monitorMessagesDelivery(phone, submission.attachmentPath, submission.previousMessageGuid);
  if (!journal.accepted.includes(jobId)) journal.accepted.push(jobId);
  await save();
  return state;
}
