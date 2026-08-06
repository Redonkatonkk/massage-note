import { Injectable, ServiceUnavailableException } from "@nestjs/common";

export interface LanguageModelResult {
  content: string;
  toolCall?: { name: string; arguments: unknown };
  provider: string;
  model: string;
}

export interface LanguageModelRequest {
  system: string;
  user: string;
  tools?: Array<{ type: "function"; function: { name: string; description: string; parameters: object } }>;
}

@Injectable()
export class MiniMaxLanguageModelProvider {
  readonly provider = "minimax";

  isConfigured() {
    return Boolean(process.env.MINIMAX_API_KEY?.trim());
  }

  async complete(input: LanguageModelRequest): Promise<LanguageModelResult> {
    const apiKey = process.env.MINIMAX_API_KEY?.trim();
    if (!apiKey) {
      throw new ServiceUnavailableException({ code: "AI_NOT_CONFIGURED", messageZh: "AI 服务尚未配置，你仍可使用手动记工和财务查询" });
    }
    const model = process.env.MINIMAX_MODEL?.trim() || "MiniMax-M3";
    const configuredBase = process.env.MINIMAX_API_BASE_URL?.trim() || "https://api.minimaxi.com";
    const base = configuredBase.replace(/\/$/, "");
    const endpoint = base.endsWith("/v1") ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "system", content: input.system }, { role: "user", content: input.user }],
          max_completion_tokens: 1_200,
          temperature: 0.2,
          reasoning_split: true,
          ...(input.tools ? { tools: input.tools, tool_choice: "auto" } : {}),
        }),
        signal: AbortSignal.timeout(45_000),
      });
      const payload = await response.json() as {
        choices?: Array<{ message?: { content?: string; tool_calls?: Array<{ function?: { name?: string; arguments?: string } }> } }>;
        base_resp?: { status_code?: number; status_msg?: string };
      };
      if (!response.ok || payload.base_resp?.status_code) {
        throw new Error(payload.base_resp?.status_msg || `HTTP ${response.status}`);
      }
      const message = payload.choices?.[0]?.message;
      if (!message) throw new Error("模型没有返回消息");
      const tool = message.tool_calls?.[0]?.function;
      let toolCall: LanguageModelResult["toolCall"];
      if (tool?.name && tool.arguments) {
        toolCall = { name: tool.name, arguments: JSON.parse(tool.arguments) as unknown };
      }
      const content = (message.content ?? "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      return { content, ...(toolCall ? { toolCall } : {}), provider: this.provider, model };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException({
        code: "AI_PROVIDER_UNAVAILABLE",
        messageZh: "AI 暂时不可用，你仍可手动记工和查看财务",
        detail: error instanceof Error ? error.message : "unknown",
      });
    }
  }
}
