import { afterEach, describe, expect, it, vi } from "vitest";
import { DELIVERY_COOLDOWN_MS, FAILURE_COOLDOWN_MS, waitForDeliveryCooldown, withDeliveryCooldown } from "../src/delivery-cooldown.js";

afterEach(() => vi.useRealTimers());
describe("delivery cooldown", () => {
  it.each([false, true])("waits two minutes after success and five after failure, failure=%s", async fail => {
    vi.useFakeTimers();
    const nextClaim = vi.fn();
    const error = new Error("ambiguous send");
    const persist = vi.fn(async (_until: string) => {});
    const result = withDeliveryCooldown(async () => {
      await new Promise(resolve => setTimeout(resolve, 15_000));
      if (fail) throw error;
      return "accepted";
    }, persist).then(value => ({ value }), reason => ({ reason })).then(value => { nextClaim(); return value; });
    const total = 15_000 + (fail ? FAILURE_COOLDOWN_MS : DELIVERY_COOLDOWN_MS);
    await vi.advanceTimersByTimeAsync(total - 1);
    expect(nextClaim).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual(fail ? { reason: error } : { value: "accepted" });
    expect(nextClaim).toHaveBeenCalledOnce();
  });

  it("重启后仍等待已经持久保存的下次领取时间", async () => {
    vi.useFakeTimers();
    const done = vi.fn();
    const wait = waitForDeliveryCooldown(new Date(Date.now() + FAILURE_COOLDOWN_MS).toISOString()).then(done);
    await vi.advanceTimersByTimeAsync(FAILURE_COOLDOWN_MS - 1);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await wait;
    expect(done).toHaveBeenCalledOnce();
  });
});
