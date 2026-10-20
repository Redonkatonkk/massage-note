import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Journal } from "../src/journal.js";

const fixture = vi.hoisted(() => ({
  journal: { accepted: [], completed: [] } as Journal,
  save: vi.fn(), send: vi.fn(), render: vi.fn(),
  state: vi.fn(),
}));
vi.mock("../src/journal.js", () => ({ loadJournal: async () => fixture.journal, saveJournal: (...args: unknown[]) => fixture.save(...args) }));
vi.mock("../src/messages.js", () => ({ messagesServices: async () => ["SMS"], sendMessagesAttachment: (...args: unknown[]) => fixture.send(...args) }));
vi.mock("../src/stager.js", () => ({ messagesStagerReady: async () => {}, stageMessagesAttachment: async () => "/mock/staged.png", messagesDeliveryState: (...args: unknown[]) => fixture.state(...args) }));
vi.mock("../src/outbox.js", () => ({ prepareOutbox: async () => "/mock", cleanupOutbox: async () => {}, closingPngPath: () => "/mock/closing.png", settlementAttachmentPath: () => "/mock/details.jpg", secureAttachment: async () => {}, secureClosingPng: async () => {} }));
vi.mock("../src/render.js", () => ({ renderClosingPng: (...args: unknown[]) => fixture.render(...args) }));
vi.mock("../src/settlement-render.js", () => ({ renderSettlementLongImage: (...args: unknown[]) => fixture.render(...args) }));
vi.mock("../src/employee-summary-render.js", () => ({ renderEmployeeSummaryImage: (...args: unknown[]) => fixture.render(...args) }));
vi.mock("../src/delivery-cooldown.js", () => ({ FAILURE_COOLDOWN_MS: 300_000, waitForDeliveryCooldown: async () => {}, withDeliveryCooldown: (callback: () => Promise<unknown>) => callback() }));

let signalListeners: Map<"SIGINT" | "SIGTERM", Function[]>;
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("MASSAGE_NOTE_API_URL", "https://agent-test.invalid/api/v1");
  vi.stubEnv("MASSAGE_NOTE_AGENT_TOKEN", "test-token");
  fixture.journal = { accepted: [], completed: [] };
  signalListeners = new Map((["SIGINT", "SIGTERM"] as const).map(signal => [signal, process.listeners(signal)]));
});
afterEach(() => {
  for (const [signal, previous] of signalListeners) {
    for (const listener of process.listeners(signal)) if (!previous.includes(listener)) process.removeListener(signal, listener);
  }
  vi.unstubAllEnvs(); vi.unstubAllGlobals();
});

function stopAgent() {
  const listener = process.listeners("SIGTERM").find(candidate => !signalListeners.get("SIGTERM")!.includes(candidate));
  if (!listener) throw new Error("Agent stop handler is missing");
  listener();
}

const job = { id: "00000000-0000-4000-8000-000000000001", leaseToken: "00000000-0000-4000-8000-000000000002", phoneE164: "+13105551234", locale: "zh_CN", snapshot: {} };
describe("agent recovery without real messages", () => {
  it("信息 App 接受后又明确失败时回写可重试失败，持久保留五分钟退避", async () => {
    fixture.send.mockResolvedValue({ service: "SMS", previousMessageGuid: null });
    fixture.state.mockResolvedValue({ messageGuid: "new-message", state: "FAILED", errorCode: 100, service: "SMS" });
    let failure: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      let payload: unknown = null;
      if (url.endsWith("/closing-delivery-agent/jobs/claim")) payload = job;
      else if (url.endsWith("/authorize")) payload = { authorized: true };
      else if (url.endsWith("/fail")) { failure = JSON.parse(String(init.body)); stopAgent(); }
      return new Response(JSON.stringify(payload));
    }));
    await import("../src/index.js");
    expect(fixture.send).toHaveBeenCalledOnce();
    expect(failure).toMatchObject({ code: "MESSAGES_DELIVERY_FAILED", retryable: true });
    expect(fixture.journal.accepted).not.toContain(job.id);
    expect(fixture.journal.started).not.toContain(job.id);
    expect(Date.parse(fixture.journal.nextClaimAt!) - Date.now()).toBeGreaterThan(299_000);
  });
  it("长脚本异常仍能回写失败，并在实际调用发送前持久保存开始记录", async () => {
    fixture.send.mockImplementation(async () => {
      expect(fixture.journal.started).toContain(job.id);
      expect(fixture.save).toHaveBeenCalled();
      throw Object.assign(new Error(`Command failed: ${"script".repeat(600)}`), { stderr: "Messages: Access denied (1)" });
    });
    let failure: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      let payload: unknown = null;
      if (url.endsWith("/closing-delivery-agent/jobs/claim")) payload = job;
      else if (url.endsWith("/authorize")) payload = { authorized: true };
      else if (url.endsWith("/fail")) { failure = JSON.parse(String(init.body)); stopAgent(); }
      return new Response(JSON.stringify(payload));
    }));
    await import("../src/index.js");
    expect(fixture.send).toHaveBeenCalledOnce();
    expect(failure).toMatchObject({ code: "MESSAGES_RESULT_AMBIGUOUS", retryable: false, message: "Messages: Access denied (1)" });
  });

  it("失败回写中断后重新领取已开始的任务，只标记需核对，不再次发送", async () => {
    fixture.journal.started = [job.id];
    let failure: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      let payload: unknown = null;
      if (url.endsWith("/closing-delivery-agent/jobs/claim")) payload = job;
      else if (url.endsWith("/fail")) { failure = JSON.parse(String(init.body)); stopAgent(); }
      return new Response(JSON.stringify(payload));
    }));
    await import("../src/index.js");
    expect(fixture.send).not.toHaveBeenCalled();
    expect(fixture.render).not.toHaveBeenCalled();
    expect(failure).toMatchObject({ code: "MESSAGES_RESULT_AMBIGUOUS", retryable: false });
  });

  it("结算图片已接受但检查点丢失时只补写检查点和完成状态", async () => {
    fixture.journal.accepted = [job.id];
    const checkpoints: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      let payload: unknown = null;
      if (url.endsWith("/employee-settlement-delivery-agent/jobs/claim")) payload = { ...job, documentType: "RANGE_SETTLEMENT", detailSent: false };
      else if (url.endsWith("/authorize")) payload = { authorized: true };
      else if (url.endsWith("/checkpoint")) checkpoints.push(JSON.parse(String(init.body)).attachment);
      else if (url.endsWith("/complete")) stopAgent();
      return new Response(JSON.stringify(payload));
    }));
    await import("../src/index.js");
    expect(fixture.send).not.toHaveBeenCalled();
    expect(fixture.render).not.toHaveBeenCalled();
    expect(checkpoints).toEqual(["SUMMARY", "DETAIL"]);
    expect(fixture.journal.completed).toContain(job.id);
  });
});
