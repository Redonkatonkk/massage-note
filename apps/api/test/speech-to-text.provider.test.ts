import { afterEach, describe, expect, it, vi } from "vitest";

const speechMocks = vi.hoisted(() => ({
  recognize: vi.fn(),
}));

vi.mock("@google-cloud/speech", () => ({
  SpeechClient: class {
    recognize = speechMocks.recognize;
  },
}));

import { GoogleSpeechToTextProvider } from "../src/ai/speech-to-text.provider.js";

const originalProjectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
const originalCredentials = process.env.GOOGLE_CLOUD_CREDENTIALS_JSON;

afterEach(() => {
  speechMocks.recognize.mockReset();
  if (originalProjectId === undefined) delete process.env.GOOGLE_CLOUD_PROJECT_ID;
  else process.env.GOOGLE_CLOUD_PROJECT_ID = originalProjectId;
  if (originalCredentials === undefined) delete process.env.GOOGLE_CLOUD_CREDENTIALS_JSON;
  else process.env.GOOGLE_CLOUD_CREDENTIALS_JSON = originalCredentials;
});

describe("GoogleSpeechToTextProvider", () => {
  it("uses a Google-supported default model for Chinese WebM/Opus audio", async () => {
    process.env.GOOGLE_CLOUD_PROJECT_ID = "test-project";
    process.env.GOOGLE_CLOUD_CREDENTIALS_JSON = JSON.stringify({
      project_id: "test-project",
      client_email: "speech@test-project.iam.gserviceaccount.com",
      private_key: "test-private-key",
    });
    speechMocks.recognize.mockResolvedValue([{ results: [{ alternatives: [{ transcript: "语音测试成功" }] }] }]);

    const result = await new GoogleSpeechToTextProvider().transcribe(Buffer.from("webm-opus"));

    expect(result.text).toBe("语音测试成功");
    expect(speechMocks.recognize).toHaveBeenCalledWith({
      audio: { content: Buffer.from("webm-opus").toString("base64") },
      config: {
        encoding: "WEBM_OPUS",
        languageCode: "zh-CN",
        alternativeLanguageCodes: ["en-US"],
        enableAutomaticPunctuation: true,
      },
    });
  });
});
