import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { SpeechClient } from "@google-cloud/speech";

@Injectable()
export class GoogleSpeechToTextProvider {
  private client?: SpeechClient;

  isConfigured() {
    return Boolean(
      process.env.GOOGLE_CLOUD_PROJECT_ID?.trim() ||
      process.env.GOOGLE_CLOUD_CREDENTIALS_BASE64?.trim() ||
      process.env.GOOGLE_CLOUD_CREDENTIALS_JSON?.trim(),
    );
  }

  async transcribe(audio: Buffer) {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException({ code: "STT_NOT_CONFIGURED", messageZh: "语音转文字尚未配置，请使用文字输入或手机键盘听写" });
    }
    if (audio.length === 0) throw new ServiceUnavailableException({ code: "AUDIO_EMPTY", messageZh: "没有收到录音内容" });
    try {
      const encoded = process.env.GOOGLE_CLOUD_CREDENTIALS_BASE64?.trim();
      const raw = encoded
        ? Buffer.from(encoded, "base64").toString("utf8")
        : process.env.GOOGLE_CLOUD_CREDENTIALS_JSON?.trim();
      const credentials = raw
        ? JSON.parse(raw) as { project_id?: string; client_email?: string; private_key?: string }
        : undefined;
      const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID?.trim() || credentials?.project_id;
      if (!projectId) throw new Error("Google Cloud 项目 ID 未配置");
      if (credentials && (!credentials.client_email || !credentials.private_key)) throw new Error("Google Cloud 凭据缺少 client_email 或 private_key");
      this.client ??= new SpeechClient({
        projectId,
        ...(credentials ? { credentials: { client_email: credentials.client_email!, private_key: credentials.private_key! } } : {}),
      });
      const [response] = await this.client.recognize({
        audio: { content: audio.toString("base64") },
        config: {
          encoding: "WEBM_OPUS",
          languageCode: "zh-CN",
          alternativeLanguageCodes: ["en-US"],
          enableAutomaticPunctuation: true,
        },
      });
      const text = response.results?.map((result) => result.alternatives?.[0]?.transcript ?? "").filter(Boolean).join(" ").trim() ?? "";
      if (!text) throw new Error("没有识别出文字");
      return { text, languageCandidates: ["zh-CN", "en-US"] };
    } catch (error) {
      throw new ServiceUnavailableException({ code: "STT_PROVIDER_UNAVAILABLE", messageZh: "语音识别暂时不可用，请改用文字输入", detail: error instanceof Error ? error.message : "unknown" });
    }
  }
}
