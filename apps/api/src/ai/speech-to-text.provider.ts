import { Injectable, ServiceUnavailableException } from "@nestjs/common";

type MiniMaxTranscriptionResponse = {
  formatted_lyrics?: string;
  audio_duration?: number;
  base_resp?: { status_code?: number; status_msg?: string };
  error?: { message?: string };
};

function transcriptionEndpoint(): string {
  const configuredBase = process.env.MINIMAX_API_BASE_URL?.trim() || "https://api.minimaxi.com";
  const base = configuredBase.replace(/\/$/, "").replace(/\/v1$/, "");
  return `${base}/v1/music_cover_preprocess`;
}

function cleanTranscript(value: string): string {
  return value
    .replace(/^\s*\[[^\]\n]+\]\s*$/gm, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

@Injectable()
export class MiniMaxSpeechToTextProvider {
  readonly provider = "minimax";

  isConfigured() {
    return Boolean(process.env.MINIMAX_API_KEY?.trim());
  }

  async transcribe(audio: Buffer, locale: "zh-CN" | "en-US" = "zh-CN") {
    const apiKey = process.env.MINIMAX_API_KEY?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException({ code: "STT_NOT_CONFIGURED", messageZh: "MiniMax 语音识别尚未配置，请使用文字输入或手机键盘听写" });
    }
    if (audio.length === 0) {
      throw new ServiceUnavailableException({ code: "AUDIO_EMPTY", messageZh: "没有收到录音内容" });
    }

    const model = process.env.MINIMAX_TRANSCRIPTION_MODEL?.trim() || "music-cover";
    try {
      const response = await fetch(transcriptionEndpoint(), {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          audio_base64: audio.toString("base64"),
        }),
        signal: AbortSignal.timeout(45_000),
      });
      const payload = await response.json() as MiniMaxTranscriptionResponse;
      if (!response.ok || payload.base_resp?.status_code) {
        throw new Error(payload.base_resp?.status_msg || payload.error?.message || `HTTP ${response.status}`);
      }
      const text = cleanTranscript(payload.formatted_lyrics ?? "");
      if (!text) throw new Error("没有识别出文字");
      return {
        text,
        languageCandidates: [locale, locale === "zh-CN" ? "en-US" : "zh-CN"],
        provider: this.provider,
        model,
        ...(payload.audio_duration === undefined ? {} : { durationSeconds: payload.audio_duration }),
      };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException({
        code: "STT_PROVIDER_UNAVAILABLE",
        messageZh: "MiniMax 语音识别暂时不可用，请改用文字输入",
        detail: error instanceof Error ? error.message : "unknown",
      });
    }
  }
}
