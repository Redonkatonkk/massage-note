// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { apiRequest } from "../../lib/api";
import { AssistantPageClient } from "./assistant-page-client";

vi.mock("../../lib/api", () => ({
  apiRequest: vi.fn(),
  errorMessage: (error: Error) => error.message,
}));
vi.mock("../../lib/realtime", () => ({ useStoreRealtime: () => "" }));

it("keeps the startup error visible and retries the store request in place", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  const request = vi.mocked(apiRequest);
  request.mockRejectedValueOnce(new Error("Store request failed")).mockResolvedValueOnce({
    memberships: [{ store: { id: "store", name: "Test store", timezone: "America/New_York" } }],
  });
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<AssistantPageClient />));
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(host.querySelector("h1")?.textContent).toBe("暂时无法打开 AI 助手");
    expect(host.querySelector('[role="alert"]')?.textContent).toBe("Store request failed");
    expect(host.querySelector(".spinner")).toBeNull();
    const retry = host.querySelector<HTMLButtonElement>(".error-card button")!;
    expect(retry.textContent?.trim()).toBe("重试");
    await act(async () => retry.click());
    expect(host.querySelector("h1")?.textContent).toBe("AI 助手");
    expect(request.mock.calls.map(([path]) => path)).toEqual(["/me", "/me"]);
    expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
  } finally {
    await act(async () => root.unmount());
    host.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
