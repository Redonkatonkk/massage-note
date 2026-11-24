import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Journal } from "../src/journal.js";

const fixture = vi.hoisted(() => ({
  journal: { accepted: [], completed: [] } as Journal,
  save: vi.fn(), send: vi.fn(), sendAttachment: vi.fn(), render: vi.fn(),
  state: vi.fn(), attachmentState: vi.fn(), prepare: vi.fn(),
}));
vi.mock("../src/journal.js", () => ({ loadJournal: async () => fixture.journal, saveJournal: (...args: unknown[]) => fixture.save(...args) }));
vi.mock("../src/messages.js", () => ({ messagesServices: async () => ["SMS"], sendMessagesAttachment: (...args: unknown[]) => fixture.sendAttachment(...args) }));
vi.mock("../src/stager.js", () => ({
  messagesStagerReady: async () => {}, stageMessagesAttachment: async () => "/mock/staged.png",
  sendStagedClosingText: (...args: unknown[]) => fixture.send(...args),
  messagesTextDeliveryState: (...args: unknown[]) => fixture.state(...args),
  messagesDeliveryState: (...args: unknown[]) => fixture.attachmentState(...args),
}));
vi.mock("../src/outbox.js", () => ({
  prepareOutbox: async () => "/mock", cleanupOutbox: async () => {}, prepareClosingText: (...args: unknown[]) => fixture.prepare(...args),
  settlementAttachmentPath: () => "/mock/details.jpg", secureAttachment: async () => {},
}));
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
  vi.useRealTimers();
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

const job = { id: "00000000-0000-4000-8000-000000000001", leaseToken: "00000000-0000-4000-8000-000000000002", phoneE164: "+13105551234", deliveryMode: "TEXT", locale: "zh_CN", snapshot: {} };
const text = `Details: https://agent-test.invalid/share/daily-snapshot#${"a".repeat(43)}`;
const prepared = { authorized: true, text };
const authorized = { authorized: true, dispatchRecorded: true };
describe("agent recovery without real messages", () => {
  it("完成请求携带真实送达回执，并在日志中持久保存以便中断恢复", async () => {
    const receipt = { messageGuid: "new-message", state: "DELIVERED", errorCode: 0, service: "RCS" };
    fixture.send.mockResolvedValue({ service: "RCS", previousMessageGuid: null });
    fixture.state.mockResolvedValue(receipt);
    let completion: unknown;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      let payload: unknown = url.endsWith("/receipts") ? [] : null;
      if (url.endsWith("/closing-delivery-agent/jobs/claim")) {
        expect(new Headers(init.headers).get("X-Closing-Delivery-Protocol")).toBe("text-v1");
        payload = job;
      } else if (url.endsWith("/prepare-text")) {
        expect(JSON.parse(String(init.body))).toEqual({ leaseToken: job.leaseToken });
        payload = prepared;
      }
      else if (url.endsWith("/authorize")) {
        expect(JSON.parse(String(init.body))).toEqual({ leaseToken: job.leaseToken, startDispatch: true });
        payload = authorized;
      }
      else if (url.endsWith("/complete")) { completion = JSON.parse(String(init.body)); stopAgent(); }
      return new Response(JSON.stringify(payload));
    }));
    await import("../src/index.js");
    expect(completion).toEqual({ leaseToken: job.leaseToken, receipt });
    expect(fixture.journal.submitted?.[job.id]).toEqual({ service: "RCS", previousMessageGuid: null, text: true, observation: receipt });
    expect(fixture.prepare).toHaveBeenCalledWith("/mock", job.id, text);
    expect(fixture.send).toHaveBeenCalledExactlyOnceWith(job.phoneE164, job.id);
    expect(fixture.sendAttachment).not.toHaveBeenCalled();
    expect(fixture.render).not.toHaveBeenCalled();
  });
  it("Mac 报错时保留发送记录和回执，等待核对而不再发送", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setTimeout"] });
    fixture.send.mockResolvedValue({ service: "SMS", previousMessageGuid: null });
    const receipt = { messageGuid: "new-message", state: "FAILED", errorCode: 100, service: "SMS" };
    fixture.state.mockResolvedValue(receipt);
    let failure: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      let payload: unknown = url.endsWith("/receipts") ? [] : null;
      if (url.endsWith("/closing-delivery-agent/jobs/claim")) payload = job;
      else if (url.endsWith("/prepare-text")) payload = prepared;
      else if (url.endsWith("/authorize")) payload = authorized;
      else if (url.endsWith("/fail")) { failure = JSON.parse(String(init.body)); stopAgent(); }
      return new Response(JSON.stringify(payload));
    }));
    const finished = import("../src/index.js");
    await vi.waitFor(() => expect(fixture.state).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(120_000);
    await finished;
    expect(fixture.send).toHaveBeenCalledOnce();
    expect(failure).toMatchObject({ code: "MESSAGES_DELIVERY_FAILED", retryable: false, receipt });
    expect(fixture.journal.accepted).not.toContain(job.id);
    expect(fixture.journal.started).toContain(job.id);
    expect(fixture.journal.submitted?.[job.id]).toBeDefined();
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
      let payload: unknown = url.endsWith("/receipts") ? [] : null;
      if (url.endsWith("/closing-delivery-agent/jobs/claim")) payload = job;
      else if (url.endsWith("/prepare-text")) payload = prepared;
      else if (url.endsWith("/authorize")) payload = authorized;
      else if (url.endsWith("/fail")) { failure = JSON.parse(String(init.body)); stopAgent(); }
      return new Response(JSON.stringify(payload));
    }));
    await import("../src/index.js");
    expect(fixture.send).toHaveBeenCalledOnce();
    expect(failure).toMatchObject({ code: "MESSAGES_RESULT_AMBIGUOUS", retryable: false, message: "Messages: Access denied (1)" });
  });

  it.each([false, true])("重新领取已开始的任务（服务端检查点=%s）时只标记待核对", async dispatchStarted => {
    if (!dispatchStarted) fixture.journal.started = [job.id];
    let failure: Record<string, unknown> | undefined;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      let payload: unknown = url.endsWith("/receipts") ? [] : null;
      if (url.endsWith("/closing-delivery-agent/jobs/claim")) payload = { ...job, dispatchStarted };
      else if (url.endsWith("/fail")) { failure = JSON.parse(String(init.body)); stopAgent(); }
      return new Response(JSON.stringify(payload));
    }));
    await import("../src/index.js");
    expect(fixture.send).not.toHaveBeenCalled();
    expect(fixture.render).not.toHaveBeenCalled();
    expect(failure).toMatchObject({ code: "MESSAGES_RESULT_AMBIGUOUS", retryable: false });
  });

  it("完成请求超时后保留送达回执供下一轮补写", async () => {
    fixture.send.mockResolvedValue({ service: "SMS", previousMessageGuid: null });
    fixture.state.mockResolvedValue({ messageGuid: "new-message", state: "DELIVERED", errorCode: 0, service: "SMS" });
    const fetch = vi.fn(async (url: string) => {
      let payload: unknown = url.endsWith("/receipts") ? [] : null;
      if (url.endsWith("/closing-delivery-agent/jobs/claim")) payload = job;
      else if (url.endsWith("/prepare-text")) payload = prepared;
      else if (url.endsWith("/authorize")) payload = authorized;
      else if (url.endsWith("/complete")) {
        stopAgent();
        throw new Error("completion timed out");
      }
      return new Response(JSON.stringify(payload));
    });
    vi.stubGlobal("fetch", fetch);
    await import("../src/index.js");
    expect(fixture.send).toHaveBeenCalledOnce();
    expect(fixture.journal.accepted).toContain(job.id);
    expect(fixture.journal.completed).not.toContain(job.id);
    expect(fetch.mock.calls.some(([url]) => url.endsWith("/fail"))).toBe(false);
  });

  it("保留已经提交的旧图片，只继续查本次附件回执", async () => {
    fixture.journal.started = [job.id];
    fixture.journal.submitted = { [job.id]: { attachmentPath: "/mock/old.png", service: "SMS", previousMessageGuid: null } };
    const receipt = { messageGuid: "old-attachment", state: "DELIVERED", errorCode: 0, service: "SMS" };
    fixture.attachmentState.mockResolvedValue(receipt);
    const fetch = vi.fn(async (url: string) => {
      let payload: unknown = url.endsWith("/receipts") ? [] : null;
      if (url.endsWith("/closing-delivery-agent/jobs/claim")) payload = { ...job, deliveryMode: "IMAGE" };
      else if (url.endsWith("/authorize")) payload = { authorized: true };
      else if (url.endsWith("/complete")) stopAgent();
      return new Response(JSON.stringify(payload));
    });
    vi.stubGlobal("fetch", fetch);
    await import("../src/index.js");
    expect(fixture.attachmentState).toHaveBeenCalledExactlyOnceWith(job.phoneE164, "/mock/old.png");
    expect(fixture.send).not.toHaveBeenCalled();
    expect(fixture.sendAttachment).not.toHaveBeenCalled();
    expect(fixture.prepare).not.toHaveBeenCalled();
    expect(fetch.mock.calls.some(([url]) => url.endsWith("/prepare-text"))).toBe(false);
    expect(fixture.journal.submitted[job.id]?.observation).toEqual(receipt);
  });

  it("旧服务器的领取响应不触发图片或文字发送", async () => {
    let failure: unknown;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      let payload: unknown = url.endsWith("/receipts") ? [] : null;
      if (url.endsWith("/closing-delivery-agent/jobs/claim")) payload = { ...job, deliveryMode: undefined };
      else if (url.endsWith("/fail")) { failure = JSON.parse(String(init.body)); stopAgent(); }
      return new Response(JSON.stringify(payload));
    }));
    await import("../src/index.js");
    expect(failure).toMatchObject({ code: "PRE_SEND_FAILURE", retryable: true });
    expect(fixture.send).not.toHaveBeenCalled();
    expect(fixture.sendAttachment).not.toHaveBeenCalled();
    expect(fixture.prepare).not.toHaveBeenCalled();
  });

  it("结算图片已接受但检查点丢失时只补写检查点和完成状态", async () => {
    fixture.journal.accepted = [job.id];
    const checkpoints: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      let payload: unknown = url.endsWith("/receipts") ? [] : null;
      if (url.endsWith("/employee-settlement-delivery-agent/jobs/claim")) payload = { ...job, documentType: "EMPLOYEE_SUMMARY", detailSent: false };
      else if (url.endsWith("/authorize")) payload = { authorized: true };
      else if (url.endsWith("/checkpoint")) checkpoints.push(JSON.parse(String(init.body)).attachment);
      else if (url.endsWith("/complete")) stopAgent();
      return new Response(JSON.stringify(payload));
    }));
    await import("../src/index.js");
    expect(fixture.send).not.toHaveBeenCalled();
    expect(fixture.sendAttachment).not.toHaveBeenCalled();
    expect(fixture.render).not.toHaveBeenCalled();
    expect(checkpoints).toEqual(["SUMMARY", "DETAIL"]);
    expect(fixture.journal.completed).toContain(job.id);
  });
});

it("sends a dated dispatch text through the shared checkpoint and records its receipt", async () => {
  const roster = "2026-11-25排工顺序\n第一：Alex";
  const receipt = { messageGuid: "roster-guid", state: "SENT", errorCode: 0, service: "SMS" };
  fixture.send.mockResolvedValue({ service: "SMS", previousMessageGuid: "older-roster" });
  fixture.state
    .mockResolvedValueOnce({ ...receipt, messageGuid: "older-roster" })
    .mockResolvedValue({ ...receipt, state: "DELIVERED" });
  const completed = vi.fn();
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
    let payload: unknown = url.endsWith("/receipts") ? [] : null;
    if (url.endsWith("/dispatch-sms-agent/jobs/claim")) payload = { id: job.id, phoneE164: job.phoneE164, leaseToken: job.leaseToken };
    else if (url.endsWith("/prepare-text")) payload = { authorized: true, text: roster };
    else if (url.endsWith("/authorize")) {
      expect(fixture.journal.dispatchBaselines?.[job.id]).toBe("older-roster");
      payload = authorized;
    } else if (url.endsWith("/complete")) { completed(JSON.parse(String(init.body))); stopAgent(); }
    return new Response(JSON.stringify(payload));
  }));
  await import("../src/index.js");
  expect(fixture.prepare).toHaveBeenCalledExactlyOnceWith("/mock", job.id, roster, "dispatch");
  expect(fixture.send).toHaveBeenCalledExactlyOnceWith(job.phoneE164, job.id, "dispatch");
  expect(completed).toHaveBeenCalledExactlyOnceWith({ leaseToken: job.leaseToken, receipt: { ...receipt, state: "DELIVERED" } });
});
