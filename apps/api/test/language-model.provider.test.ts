import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MiniMaxLanguageModelProvider } from "../src/ai/language-model.provider.js";

const request = { system: "记工助手", user: "查询今天记工" };
const reply = (finish_reason: string, content: string | null, tool_calls?: unknown[]) =>
  new Response(JSON.stringify({ choices: [{ finish_reason, message: { content, tool_calls } }] }));

describe("MiniMax completion integrity", () => {
  const fetchMock = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.stubEnv("MINIMAX_API_KEY", "test-key");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it("returns a complete answer without retrying", async () => {
    fetchMock.mockResolvedValueOnce(reply("stop", "<think>internal</think>完整回复。"));
    expect(await new MiniMaxLanguageModelProvider().complete(request)).toMatchObject({ content: "完整回复。" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("discards truncated text and retries the original request with a larger budget", async () => {
    fetchMock.mockResolvedValueOnce(reply("length", "半截"))
      .mockResolvedValueOnce(reply("stop", "完整回复。"));
    expect(await new MiniMaxLanguageModelProvider().complete(request)).toMatchObject({ content: "完整回复。" });
    const bodies = fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init?.body)));
    expect(bodies.map((body) => body.max_completion_tokens)).toEqual([8192, 16384]);
    expect(bodies[1].messages).toEqual(bodies[0].messages);
  });

  it("never parses or returns truncated tool arguments", async () => {
    fetchMock.mockResolvedValueOnce(reply("length", null, [{ function: { name: "read", arguments: '{"date":' } }]))
      .mockResolvedValueOnce(reply("tool_calls", null, [{ function: { name: "read", arguments: '{"date":"today"}' } }]));
    expect(await new MiniMaxLanguageModelProvider().complete(request)).toMatchObject({ toolCall: { name: "read", arguments: { date: "today" } } });
  });

  it("reports persistent truncation instead of exposing a partial answer", async () => {
    fetchMock.mockImplementation(async () => reply("length", "半截"));
    await expect(new MiniMaxLanguageModelProvider().complete(request)).rejects.toMatchObject({
      response: { code: "AI_RESPONSE_INCOMPLETE" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each(["stop", "content_filter"])("rejects empty or interrupted output (%s)", async (reason) => {
    fetchMock.mockResolvedValueOnce(reply(reason, ""));
    await expect(new MiniMaxLanguageModelProvider().complete(request)).rejects.toMatchObject({
      response: { code: "AI_PROVIDER_UNAVAILABLE" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry network failures", async () => {
    fetchMock.mockRejectedValueOnce(new Error("connection closed"));
    await expect(new MiniMaxLanguageModelProvider().complete(request)).rejects.toMatchObject({
      response: { code: "AI_PROVIDER_UNAVAILABLE" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
