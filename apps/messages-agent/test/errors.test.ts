import { describe, expect, it } from "vitest";
import { closingAgentHeartbeatSchema, closingDeliveryFailureSchema } from "../../../packages/contracts/src/closing-delivery.js";
import { agentErrorMessage } from "../src/errors.js";

describe("agent error reporting", () => {
  it("保留实际 AppleScript 错误，不把命令、完整脚本和收件号码作为错误正文", () => {
    const error = Object.assign(new Error(`Command failed: osascript ${"script source\n".repeat(200)} -- +13105551234`), {
      stderr: "1990:2035: execution error: Messages: Access denied. You do not have permission to send this file. (1)\n",
    });
    const message = agentErrorMessage(error);
    expect(message).toContain("Access denied");
    expect(message).not.toContain("script source");
    expect(message).not.toContain("3105551234");
    expect(closingDeliveryFailureSchema.safeParse({ leaseToken: "00000000-0000-4000-8000-000000000001", code: "MESSAGES_RESULT_AMBIGUOUS", message, retryable: false }).success).toBe(true);
    expect(closingAgentHeartbeatSchema.safeParse({ messagesAvailable: false, serviceTypes: ["SMS"], version: "1.0.0", lastError: message }).success).toBe(true);
  });

  it("超长 stderr 和普通错误都满足接口上限，保留末尾的失败原因", () => {
    for (const error of [new Error(`${"长错误".repeat(1000)} Access denied`), { stderr: `${"warning\n".repeat(500)} Access denied` }]) {
      const message = agentErrorMessage(error);
      expect(message.length).toBeLessThanOrEqual(1000);
      expect(message).toMatch(/Access denied$/);
    }
  });

  it("空错误使用非空说明，普通错误隐藏完整手机号", () => {
    expect(agentErrorMessage(new Error("  "))).toBe("Unknown agent error");
    expect(agentErrorMessage(new Error("Cannot address +13105551234 or 3105555678"))).toBe("Cannot address [phone] or [phone]");
  });
});
