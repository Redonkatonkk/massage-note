import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { messagesServices, sendMessagesAttachment } from "./messages.js";
import { cleanupOutbox, closingPngPath, prepareOutbox, secureAttachment, secureClosingPng, settlementAttachmentPath } from "./outbox.js";
import { renderClosingPng, type ClosingSnapshot } from "./render.js";
import { renderSettlementArtifacts, type SettlementSnapshot } from "./settlement-render.js";
import { messagesStagerReady, stageMessagesAttachment } from "./stager.js";

const apiUrl = process.env.MASSAGE_NOTE_API_URL?.replace(/\/$/, "");
const agentToken = process.env.MASSAGE_NOTE_AGENT_TOKEN;
const dataDir = process.env.MASSAGE_NOTE_AGENT_DATA_DIR ?? join(homedir(), "Library", "Application Support", "Massage Note Messages Agent");
if (!apiUrl || !agentToken) throw new Error("MASSAGE_NOTE_API_URL and MASSAGE_NOTE_AGENT_TOKEN are required");

interface Job { id: string; leaseToken: string; phoneE164: string; locale: "zh_CN" | "en_US"; snapshot: ClosingSnapshot }
interface SettlementJob { id: string; documentType: "RANGE_SETTLEMENT"; leaseToken: string; phoneE164: string; locale: "zh_CN" | "en_US"; summarySent: boolean; detailSent: boolean; snapshot: SettlementSnapshot }
interface Journal { accepted: string[]; completed: string[] }
const journalPath = join(dataDir, "journal.json");
const outboxDir = await prepareOutbox(dataDir);
await cleanupOutbox(outboxDir);

async function loadJournal(): Promise<Journal> {
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  try { return JSON.parse(await readFile(journalPath, "utf8")) as Journal; } catch { return { accepted: [], completed: [] }; }
}

async function saveJournal(journal: Journal) {
  await writeFile(journalPath, JSON.stringify(journal), { encoding: "utf8", mode: 0o600 });
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${apiUrl}${path}`, { ...init, headers: { Authorization: `Bearer ${agentToken}`, "Content-Type": "application/json", ...init.headers } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${response.status} ${(payload as { messageZh?: string } | null)?.messageZh ?? response.statusText}`);
  return payload as T;
}

async function heartbeat(lastError: string | null = null) {
  let services: string[] = [];
  let diagnosticError = lastError;
  try {
    services = await messagesServices();
    await messagesStagerReady();
  } catch (error) {
    diagnosticError = error instanceof Error ? error.message : String(error);
  }
  try {
    await request("/closing-delivery-agent/heartbeat", { method: "POST", body: JSON.stringify({ messagesAvailable: services.length > 0, serviceTypes: services.filter((item): item is "iMessage" | "RCS" | "SMS" => ["iMessage", "RCS", "SMS"].includes(item)), version: "0.12.31", lastError: diagnosticError }) });
  } catch (error) {
    process.stderr.write(`heartbeat: ${error instanceof Error ? error.message : String(error)}\n`);
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
    journal.completed.push(job.id); await saveJournal(journal); return;
  }
  const authorized = await request<{ authorized: boolean }>(`/closing-delivery-agent/jobs/${job.id}/authorize`, { method: "POST", body: JSON.stringify({ leaseToken: job.leaseToken }) });
  if (!authorized.authorized) return;
  const workDir = await mkdtemp(join(tmpdir(), "massage-note-closing-"));
  const svgPath = join(workDir, "closing.svg");
  const pngPath = closingPngPath(outboxDir, job.id);
  let sendStarted = false;
  try {
    await renderClosingPng(job.snapshot, job.locale, svgPath, pngPath);
    await secureClosingPng(pngPath);
    const stagedPath = await stageMessagesAttachment(pngPath, job.id);
    sendStarted = true;
    await sendMessagesAttachment(job.phoneE164, stagedPath);
    journal.accepted.push(job.id); await saveJournal(journal);
    await request(`/closing-delivery-agent/jobs/${job.id}/complete`, { method: "POST", body: JSON.stringify({ leaseToken: job.leaseToken }) });
    journal.completed.push(job.id); await saveJournal(journal);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await request(`/closing-delivery-agent/jobs/${job.id}/fail`, { method: "POST", body: JSON.stringify({ leaseToken: job.leaseToken, code: sendStarted ? "MESSAGES_RESULT_AMBIGUOUS" : "PRE_SEND_FAILURE", message, retryable: !sendStarted }) }).catch(() => undefined);
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function processSettlementJob(job: SettlementJob) {
  const authorized = await request<{ authorized: boolean }>(`/employee-settlement-delivery-agent/jobs/${job.id}/authorize`, { method: "POST", body: JSON.stringify({ leaseToken: job.leaseToken }) });
  if (!authorized.authorized) return;
  const workDir = await mkdtemp(join(tmpdir(), "massage-note-settlement-"));
  const summaryPath = settlementAttachmentPath(outboxDir, job.id, "summary");
  const detailsPath = settlementAttachmentPath(outboxDir, job.id, "details");
  let activeAttachment: "SUMMARY" | "DETAIL" = job.summarySent ? "DETAIL" : "SUMMARY";
  let sendStarted = false;
  try {
    await renderSettlementArtifacts(job.snapshot, job.locale, workDir, summaryPath, detailsPath);
    await Promise.all([secureAttachment(summaryPath), secureAttachment(detailsPath)]);
    if (!job.summarySent) {
      activeAttachment = "SUMMARY";
      sendStarted = false;
      const staged = await stageMessagesAttachment(summaryPath, job.id, "settlement-summary.png");
      sendStarted = true;
      await sendMessagesAttachment(job.phoneE164, staged);
      await request(`/employee-settlement-delivery-agent/jobs/${job.id}/checkpoint`, { method: "POST", body: JSON.stringify({ leaseToken: job.leaseToken, attachment: "SUMMARY" }) });
    }
    if (!job.detailSent) {
      activeAttachment = "DETAIL";
      sendStarted = false;
      const staged = await stageMessagesAttachment(detailsPath, job.id, "settlement-details.pdf");
      sendStarted = true;
      await sendMessagesAttachment(job.phoneE164, staged);
      await request(`/employee-settlement-delivery-agent/jobs/${job.id}/checkpoint`, { method: "POST", body: JSON.stringify({ leaseToken: job.leaseToken, attachment: "DETAIL" }) });
    }
    await request(`/employee-settlement-delivery-agent/jobs/${job.id}/complete`, { method: "POST", body: JSON.stringify({ leaseToken: job.leaseToken }) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await request(`/employee-settlement-delivery-agent/jobs/${job.id}/fail`, { method: "POST", body: JSON.stringify({ leaseToken: job.leaseToken, code: sendStarted ? `${activeAttachment}_RESULT_AMBIGUOUS` : `${activeAttachment}_PRE_SEND_FAILURE`, message, retryable: !sendStarted }) }).catch(() => undefined);
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

let stopped = false;
process.on("SIGTERM", () => { stopped = true; });
process.on("SIGINT", () => { stopped = true; });

const journal = await loadJournal();
await heartbeat();
let lastHeartbeat = Date.now();
while (!stopped) {
  try {
    const settlementJob = await request<SettlementJob | null>("/employee-settlement-delivery-agent/jobs/claim", { method: "POST" });
    if (settlementJob) await processSettlementJob(settlementJob);
    else {
      const job = await request<Job | null>("/closing-delivery-agent/jobs/claim", { method: "POST" });
      if (job) await processJob(job, journal);
    }
    if (Date.now() - lastHeartbeat > 60_000) { await heartbeat(); await cleanupOutbox(outboxDir); lastHeartbeat = Date.now(); }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${new Date().toISOString()} ${message}\n`);
    if (Date.now() - lastHeartbeat > 60_000) { await heartbeat(message); await cleanupOutbox(outboxDir); lastHeartbeat = Date.now(); }
  }
  await new Promise((resolve) => setTimeout(resolve, 10_000));
}
