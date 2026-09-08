import { afterEach, expect, it, vi } from "vitest";
import { apiRequest } from "./api";

afterEach(() => vi.unstubAllGlobals());

it("重试保留调用方给出的幂等键", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
  vi.stubGlobal("fetch", fetch);
  await apiRequest("/test", { method: "POST", idempotent: true, headers: { "Idempotency-Key": "stable-key" }, body: {} });
  expect(new Headers(fetch.mock.calls[0]![1].headers).get("Idempotency-Key")).toBe("stable-key");
});
