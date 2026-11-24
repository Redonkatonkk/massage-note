import { afterEach, describe, expect, it, vi } from "vitest";
import { messagesDeliveryState, type MessagesDeliveryState } from "../src/stager.js";
import { MessagesDeliveryFailed, monitorMessagesDelivery } from "../src/delivery-monitor.js";
vi.mock("../src/stager.js", () => ({ messagesDeliveryState: vi.fn() }));
const read = vi.mocked(messagesDeliveryState);
const state = (value: MessagesDeliveryState["state"], guid = "current") => ({ messageGuid: guid, state: value, errorCode: value === "FAILED" ? 100 : 0, service: "SMS" });
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

describe("Messages result monitoring", () => {
  it("先接受再失败的短信不能记为成功", async () => {
    vi.useFakeTimers();
    read.mockResolvedValueOnce(state("PENDING")).mockResolvedValue(state("FAILED"));
    const result = monitorMessagesDelivery("+13105551234", "/task", null).catch(error => error);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await result).toBeInstanceOf(MessagesDeliveryFailed);
  });
  it("Mac 暂时报告失败或查回执失败时继续观察，之后可以确认送达", async () => {
    vi.useFakeTimers();
    read.mockResolvedValueOnce(state("FAILED")).mockRejectedValueOnce(new Error("status unavailable")).mockResolvedValue(state("DELIVERED"));
    const result = monitorMessagesDelivery("+13105551234", "/task", null);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(result).resolves.toMatchObject({ state: "DELIVERED" });
  });
  it("SMS 没有送达回执时观察完整两分钟，保持已发出与送达的区别", async () => {
    vi.useFakeTimers(); read.mockResolvedValue(state("SENT"));
    const done = vi.fn(); const result = monitorMessagesDelivery("+13105551234", "/task", null).then(value => { done(); return value; });
    await vi.advanceTimersByTimeAsync(119_999); expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect((await result).state).toBe("SENT");
  });
  it("上一轮的已送达记录不能充当重试的成功结果", async () => {
    vi.useFakeTimers(); read.mockResolvedValueOnce(state("DELIVERED", "previous")).mockResolvedValue(state("FAILED"));
    const result = monitorMessagesDelivery("+13105551234", "/task", "previous").catch(error => error);
    await vi.advanceTimersByTimeAsync(120_000); expect(await result).toBeInstanceOf(MessagesDeliveryFailed);
  });
  it("等不到本次消息或一直等待时只标记待核对，不自动重发", async () => {
    vi.useFakeTimers(); read.mockResolvedValue(state("MISSING"));
    const result = monitorMessagesDelivery("+13105551234", "/task", null).catch(error => error);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await result).toMatchObject({ message: expect.stringContaining("结果待核对") });
    expect(await result).not.toBeInstanceOf(MessagesDeliveryFailed);
  });
  it("持续无法读取回执时保留诊断错误", async () => {
    read.mockResolvedValueOnce(state("DELIVERED"));
    expect((await monitorMessagesDelivery("+13105551234", "/task", null)).state).toBe("DELIVERED");
    vi.useFakeTimers();
    const cause = new Error("status unavailable");
    read.mockRejectedValue(cause);
    const result = monitorMessagesDelivery("+13105551234", "/task", null).catch(error => error);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await result).toMatchObject({ cause });
  });
});
