import { afterEach, describe, expect, it, vi } from "vitest";
import { withDeliveryCooldown } from "../src/delivery-cooldown.js";

afterEach(() => vi.useRealTimers());
describe("delivery cooldown", () => {
  it.each([false, true])("waits a full minute after completion, failure=%s", async fail => {
    vi.useFakeTimers();
    const nextClaim = vi.fn();
    const error = new Error("ambiguous send");
    const result = withDeliveryCooldown(async () => {
      await new Promise(resolve => setTimeout(resolve, 15_000));
      if (fail) throw error;
      return "accepted";
    }).then(value => ({ value }), reason => ({ reason })).then(value => { nextClaim(); return value; });
    await vi.advanceTimersByTimeAsync(74_999);
    expect(nextClaim).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual(fail ? { reason: error } : { value: "accepted" });
    expect(nextClaim).toHaveBeenCalledOnce();
  });
});
