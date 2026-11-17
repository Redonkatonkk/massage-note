import { monitorMessagesDelivery, monitorMessagesTextDelivery } from "./delivery-monitor.js";
import type { Journal } from "./journal.js";
import { sendMessagesAttachment } from "./messages.js";
import { sendStagedClosingText } from "./stager.js";

export async function submitAndConfirmMessages(
  jobId: string, phone: string, path: string | null, kind: "IMAGE" | "CONVERSATION_IMAGE" | "TEXT",
  journal: Journal, save: () => Promise<void>,
) {
  let submission = journal.submitted?.[jobId];
  if (!submission) {
    if (!journal.started?.includes(jobId)) (journal.started ??= []).push(jobId);
    await save();
    if (kind === "TEXT") {
      submission = { ...await sendStagedClosingText(phone, jobId), text: true };
    } else {
      if (path === null) throw new Error("Messages task attachment is missing");
      submission = { ...await sendMessagesAttachment(phone, path, kind), attachmentPath: path };
    }
    (journal.submitted ??= {})[jobId] = submission;
    await save();
  }
  const state = submission.text
    ? await monitorMessagesTextDelivery(phone, jobId, submission.previousMessageGuid)
    : await monitorMessagesDelivery(phone, submission.attachmentPath, submission.previousMessageGuid);
  submission.observation = state;
  if (!journal.accepted.includes(jobId)) journal.accepted.push(jobId);
  await save();
  return state;
}
