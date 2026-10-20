import { FAILURE_COOLDOWN_MS, waitForDeliveryCooldown, withDeliveryCooldown } from "./delivery-cooldown.js";
import { loadJournal, saveJournal, type Journal } from "./journal.js";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { messagesServices } from "./messages.js";
import { cleanupOutbox, closingPngPath, prepareOutbox, secureAttachment, secureClosingPng, settlementAttachmentPath } from "./outbox.js";
import { renderClosingPng, type ClosingSnapshot } from "./render.js";
import { renderSettlementLongImage, type SettlementSnapshot } from "./settlement-render.js";
import { renderEmployeeSummaryImage, type EmployeeSummarySnapshot } from "./employee-summary-render.js";
import { messagesStagerReady, stageMessagesAttachment } from "./stager.js";
import { agentErrorMessage } from "./errors.js";
import { MessagesDeliveryFailed } from "./delivery-monitor.js";
import { submitAndConfirmMessages } from "./submission.js";

const { version } = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

const apiUrl = process.env.MASSAGE_NOTE_API_URL?.replace(/\/$/, "");
const agentToken = process.env.MASSAGE_NOTE_AGENT_TOKEN;
const dataDir = process.env.MASSAGE_NOTE_AGENT_DATA_DIR ?? join(homedir(), "Library", "Application Support", "Massage Note Messages Agent");
if (!apiUrl || !agentToken) throw new Error("MASSAGE_NOTE_API_URL and MASSAGE_NOTE_AGENT_TOKEN are required");

interface Job { id: string; leaseToken: string; phoneE164: string; locale: "zh_CN" | "en_US"; snapshot: ClosingSnapshot }
interface RangeSettlementJob { id: string; documentType: "RANGE_SETTLEMENT"; leaseToken: string; phoneE164: string; locale: "zh_CN" | "en_US"; detailSent: boolean; snapshot: SettlementSnapshot }
interface EmployeeSummaryJob { id: string; documentType: "EMPLOYEE_SUMMARY"; leaseToken: string; phoneE164: string; locale: "zh_CN" | "en_US"; detailSent: boolean; snapshot: EmployeeSummarySnapshot }
type SettlementJob = RangeSettlementJob | EmployeeSummaryJob;
const journalPath = join(dataDir, "journal.json");
const outboxDir = await prepareOutbox(dataDir);
await cleanupOutbox(outboxDir);
let messagesReady = false;

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { ...init, signal: init.signal ?? AbortSignal.timeout(30_000), headers: { Authorization: `Bearer ${agentToken}`, "Content-Type": "application/json", ...init.headers } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${response.status} ${(payload as { messageZh?: string } | null)?.messageZh ?? response.statusText}`);
  return payload as T;
}

async function heartbeat(lastError: string | null = null) {
  let services: string[] = [];
  let stagerReady = false;
  let diagnosticError = lastError;
  try {
    services = await messagesServices();
    await messagesStagerReady();
    stagerReady = true;
  } catch (error) {
    diagnosticError = agentErrorMessage(error);
  }
  messagesReady = stagerReady && services.some(item => ["iMessage", "RCS", "SMS"].includes(item));
  try {
    await request("/closing-delivery-agent/heartbeat", { method: "POST", body: JSON.stringify({ messagesAvailable: messagesReady, serviceTypes: services.filter((item): item is "iMessage" | "RCS" | "SMS" => ["iMessage", "RCS", "SMS"].includes(item)), version, lastError: diagnosticError === null ? null : agentErrorMessage(diagnosticError) }) });
  } catch (error) {
    process.stderr.write(`heartbeat: ${agentErrorMessage(error)}\n`);
  }
}

if (process.argv.includes("--diagnose")) {
  const services = await messagesServices();
  const supported = services.filter((item) => ["iMessage", "RCS", "SMS"].includes(item));
  if (supported.length === 0) {
    throw new Error("信息 App 没有可用的 iMessage、RCS 或 SMS 服务，请先登录信息，并检查 iPhone 短信转发");
  }
  await messagesStagerReady();
  process.stdout.write(`Messages background automation and attachment staging ready: ${supported.join(" / ")}\n`);
  process.exit(0);
}

async function processJob(job: Job, journal: Journal) {
  if (journal.completed.includes(job.id)) return;
  if (journal.accepted.includes(job.id)) {
    await request(`/closing-delivery-agent/jobs/${job.id}/complete`, { method: "POST", body: JSON.stringify({ leaseToken: job.leaseToken }) });
    journal.completed.push(job.id); await saveJournal(journalPath, journal); return;
  }
  if (journal.started?.includes(job.id) && !journal.submitted?.[job.id]) {
    await request(`/closing-delivery-agent/jobs/${job.id}/fail`, { method: "POST", body: JSON.stringify({ leaseToken: job.leaseToken, code: "MESSAGES_RESULT_AMBIGUOUS", message: "上次已开始发送，但没有明确回执；请人工核对信息 App，不自动重发。", retryable: false }) });
    return;
  }
  const authorized = await request<{ authorized: boolean }>(`/closing-delivery-agent/jobs/${job.id}/authorize`, { method: "POST", body: JSON.stringify({ leaseToken: job.leaseToken }) });
  if (!authorized.authorized) return;
  const pending = journal.submitted?.[job.id];
  const workDir = pending ? null : await mkdtemp(join(tmpdir(), "massage-note-closing-"));
  let sendStarted = Boolean(pending);
  try {
    let stagedPath = pending?.attachmentPath;
    if (!stagedPath && workDir) {
      const pngPath = closingPngPath(outboxDir, job.id);
      await renderClosingPng(job.snapshot, job.locale, join(workDir, "closing.svg"), pngPath);
      await secureClosingPng(pngPath);
      stagedPath = await stageMessagesAttachment(pngPath, job.id);
    }
    if (!stagedPath) throw new Error("Messages task attachment is missing");
    const ready = await request<{ authorized: boolean }>(`/closing-delivery-agent/jobs/${job.id}/authorize`, { method: "POST", body: JSON.stringify({ leaseToken: job.leaseToken }) });
    if (!ready.authorized) return;
    sendStarted = true;
    await submitAndConfirmMessages(job.id, job.phoneE164, stagedPath, "IMAGE", journal, () => saveJournal(journalPath, journal));
    await request(`/closing-delivery-agent/jobs/${job.id}/complete`, { method: "POST", body: JSON.stringify({ leaseToken: job.leaseToken }) });
    journal.completed.push(job.id); await saveJournal(journalPath, journal);
  } catch (error) {
    await reportJobFailure("closing-delivery-agent", job, error, sendStarted, journal);
    throw error;
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  }
}

async function completeSettlementJob(job: SettlementJob, journal: Journal) {
  if (!job.detailSent) {
    // Both historical checkpoints refer to the same long image.
    await request(`/employee-settlement-delivery-agent/jobs/${job.id}/checkpoint`, { method: "POST", body: JSON.stringify({ leaseToken: job.leaseToken, attachment: "SUMMARY" }) });
    await request(`/employee-settlement-delivery-agent/jobs/${job.id}/checkpoint`, { method: "POST", body: JSON.stringify({ leaseToken: job.leaseToken, attachment: "DETAIL" }) });
  }
  await request(`/employee-settlement-delivery-agent/jobs/${job.id}/complete`, { method: "POST", body: JSON.stringify({ leaseToken: job.leaseToken }) });
  journal.completed.push(job.id);
  await saveJournal(journalPath, journal);
}

async function processSettlementJob(job: SettlementJob, journal: Journal) {
  const authorized = await request<{ authorized: boolean }>(`/employee-settlement-delivery-agent/jobs/${job.id}/authorize`, { method: "POST", body: JSON.stringify({ leaseToken: job.leaseToken }) });
  if (!authorized.authorized) return;
  if (!job.detailSent && journal.completed.includes(job.id)) {
    // A completed job claimed again has been explicitly requeued by a manager.
    journal.completed = journal.completed.filter(id => id !== job.id);
    journal.accepted = journal.accepted.filter(id => id !== job.id);
    journal.started = (journal.started ?? []).filter(id => id !== job.id);
    if (journal.submitted) delete journal.submitted[job.id];
    await saveJournal(journalPath, journal);
  }
  if (job.detailSent || journal.accepted.includes(job.id)) {
    await completeSettlementJob(job, journal);
    return;
  }
  if (journal.started?.includes(job.id) && !journal.submitted?.[job.id]) {
    await request(`/employee-settlement-delivery-agent/jobs/${job.id}/fail`, { method: "POST", body: JSON.stringify({ leaseToken: job.leaseToken, code: "DETAIL_RESULT_AMBIGUOUS", message: "上次已开始发送，但没有明确回执；请人工核对信息 App，不自动重发。", retryable: false }) });
    return;
  }
  const pending = journal.submitted?.[job.id];
  const workDir = pending ? null : await mkdtemp(join(tmpdir(), "massage-note-settlement-"));
  const detailsImagePath = settlementAttachmentPath(outboxDir, job.id);
  let sendStarted = Boolean(pending);
  try {
    let staged = pending?.attachmentPath;
    if (!staged && workDir) {
      if (job.documentType === "EMPLOYEE_SUMMARY") await renderEmployeeSummaryImage(job.snapshot, job.locale, workDir, detailsImagePath);
      else await renderSettlementLongImage(job.snapshot, job.locale, workDir, detailsImagePath);
      await secureAttachment(detailsImagePath);
      staged = await stageMessagesAttachment(detailsImagePath, job.id, "settlement-details.jpg", true);
    }
    if (!staged) throw new Error("Messages task attachment is missing");
    if (!job.detailSent) {
      const ready = await request<{ authorized: boolean }>(`/employee-settlement-delivery-agent/jobs/${job.id}/authorize`, { method: "POST", body: JSON.stringify({ leaseToken: job.leaseToken }) });
      if (!ready.authorized) return;
      sendStarted = true;
      const state = await submitAndConfirmMessages(job.id, job.phoneE164, staged, "CONVERSATION_IMAGE", journal, () => saveJournal(journalPath, journal));
      process.stdout.write(`settlement ${job.id} ${job.documentType.toLowerCase()} image ${state.state.toLowerCase()}\n`);
    }
    await completeSettlementJob(job, journal);
  } catch (error) {
    await reportJobFailure("employee-settlement-delivery-agent", job, error, sendStarted, journal);
    throw error;
  } finally {
    if (workDir) await rm(workDir, { recursive: true, force: true });
  }
}

async function reportJobFailure(prefix: string, job: { id: string; leaseToken: string }, error: unknown, sendStarted: boolean, journal: Journal) {
  const confirmedFailure = error instanceof MessagesDeliveryFailed;
  if (confirmedFailure) {
    journal.started = (journal.started ?? []).filter(id => id !== job.id);
    journal.accepted = journal.accepted.filter(id => id !== job.id);
    if (journal.submitted) delete journal.submitted[job.id];
    journal.nextClaimAt = new Date(Date.now() + FAILURE_COOLDOWN_MS).toISOString();
    await saveJournal(journalPath, journal);
  }
  const ambiguousCode = prefix === "closing-delivery-agent" ? "MESSAGES_RESULT_AMBIGUOUS" : "DETAIL_RESULT_AMBIGUOUS";
  await request(`/${prefix}/jobs/${job.id}/fail`, { method: "POST", body: JSON.stringify({ leaseToken: job.leaseToken,
    code: confirmedFailure ? "MESSAGES_DELIVERY_FAILED" : sendStarted ? ambiguousCode : "PRE_SEND_FAILURE",
    message: agentErrorMessage(error), retryable: confirmedFailure || !sendStarted,
  }) }).catch(reportError => process.stderr.write(`failure report: ${agentErrorMessage(reportError)}\n`));
}

let stopped = false;
process.on("SIGTERM", () => { stopped = true; });
process.on("SIGINT", () => { stopped = true; });

const journal = await loadJournal(journalPath);
await heartbeat();
let heartbeatRunning = false;
const heartbeatTimer = setInterval(() => {
  if (heartbeatRunning) return;
  heartbeatRunning = true;
  void heartbeat().finally(() => { heartbeatRunning = false; });
}, 60_000);
heartbeatTimer.unref();
const persistCooldown = async (until: string) => {
  journal.nextClaimAt = until;
  await saveJournal(journalPath, journal);
};
try {
while (!stopped) {
  let handledJob = false;
  try {
    if (!messagesReady) {
      await new Promise(resolve => setTimeout(resolve, 10_000));
      continue;
    }
    await waitForDeliveryCooldown(journal.nextClaimAt);
    if (stopped) break;
    const settlementJob = await request<SettlementJob | null>("/employee-settlement-delivery-agent/jobs/claim", { method: "POST" });
    if (settlementJob) {
      handledJob = true;
      await withDeliveryCooldown(() => processSettlementJob(settlementJob, journal), persistCooldown);
    }
    else {
      const job = await request<Job | null>("/closing-delivery-agent/jobs/claim", { method: "POST" });
      if (job) {
        handledJob = true;
        await withDeliveryCooldown(() => processJob(job, journal), persistCooldown);
      }
    }
    await cleanupOutbox(outboxDir);
  } catch (error) {
    const message = agentErrorMessage(error);
    process.stderr.write(`${new Date().toISOString()} ${message}\n`);
    await heartbeat(message);
  }
  if (!handledJob) await new Promise((resolve) => setTimeout(resolve, 10_000));
}
} finally { clearInterval(heartbeatTimer); }
