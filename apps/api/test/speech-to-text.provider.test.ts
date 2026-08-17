import { afterEach, describe, expect, it, vi } from "vitest";
import { MiniMaxSpeechToTextProvider } from "../src/ai/speech-to-text.provider.js";

const originalKey = process.env.MINIMAX_API_KEY;
const originalBase = process.env.MINIMAX_API_BASE_URL;
const originalModel = process.env.MINIMAX_TRANSCRIPTION_MODEL;
const originalFetch = global.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  global.fetch = originalFetch;
  if (originalKey === undefined) delete process.env.MINIMAX_API_KEY;
  else process.env.MINIMAX_API_KEY = originalKey;
  if (originalBase === undefined) delete process.env.MINIMAX_API_BASE_URL;
  else process.env.MINIMAX_API_BASE_URL = originalBase;
  if (originalModel === undefined) delete process.env.MINIMAX_TRANSCRIPTION_MODEL;
  else process.env.MINIMAX_TRANSCRIPTION_MODEL = originalModel;
});

describe("MiniMaxSpeechToTextProvider", () => {
  it("uses MiniMax ASR with the shared MiniMax API key for MP4 audio", async () => {
    process.env.MINIMAX_API_KEY = "test-key";
    process.env.MINIMAX_API_BASE_URL = "https://api.minimaxi.com";
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      formatted_lyrics: "[Verse]\n给 Amy 记一单六十分钟，\n现金一百。",
      audio_duration: 8.2,
      base_resp: { status_code: 0, status_msg: "success" },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const audio = Buffer.from("mp4-aac");
    const result = await new MiniMaxSpeechToTextProvider().transcribe(audio);

    expect(result).toEqual({
      text: "给 Amy 记一单六十分钟，\n现金一百。",
      languageCandidates: ["zh-CN", "en-US"],
      provider: "minimax",
      model: "music-cover",
      durationSeconds: 8.2,
    });
    expect(fetch).toHaveBeenCalledWith("https://api.minimaxi.com/v1/music_cover_preprocess", expect.objectContaining({
      method: "POST",
      headers: { Authorization: "Bearer test-key", "Content-Type": "application/json" },
    }));
    const request = JSON.parse(String((vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit).body)) as {
      model: string;
      audio_base64: string;
    };
    expect(request.model).toBe("music-cover");
    expect(request.audio_base64).toBe(audio.toString("base64"));
  });

  it("uses English as the primary language when the UI requests it", async () => {
    process.env.MINIMAX_API_KEY = "test-key";
    process.env.MINIMAX_TRANSCRIPTION_MODEL = "music-cover-custom";
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      formatted_lyrics: "[Verse 1]\nRecord Amy for sixty minutes.",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await new MiniMaxSpeechToTextProvider().transcribe(Buffer.from("mp4-aac"), "en-US");

    expect(result.text).toBe("Record Amy for sixty minutes.");
    expect(result.languageCandidates).toEqual(["en-US", "zh-CN"]);
    expect(result.model).toBe("music-cover-custom");
  });

  it("reports an unavailable provider when MiniMax returns no speech", async () => {
    process.env.MINIMAX_API_KEY = "test-key";
    global.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      formatted_lyrics: "",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(new MiniMaxSpeechToTextProvider().transcribe(Buffer.from("mp4-aac"))).rejects.toMatchObject({
      response: expect.objectContaining({ code: "STT_PROVIDER_UNAVAILABLE" }),
    });
  });
});
