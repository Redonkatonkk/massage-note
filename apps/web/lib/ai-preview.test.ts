import { describe, expect, it } from "vitest";
import { aiPreviewRows } from "./ai-preview";
import type { AiPreview } from "./types";

describe("AI confirmation preview", () => {
  it("shows exact cents, store-local times and explicit field clearing", () => {
    const preview: AiPreview = {
      previewId: "preview", operation: "UPDATE_WORK_RECORD", expiresAt: "2026-09-08T22:00:00Z",
      target: { startAt: "2026-09-08T19:00:00Z", endAt: "2026-09-08T20:00:00Z", employee: { displayName: "Amy" } },
      before: null, warnings: [], after: {
        endAt: null, amountCents: 10050, payment: { cashServiceCents: 10050, cardTipCents: 1234 },
        addons: [{ name: "Hot stone", amountCents: 1050 }], discounts: [],
      },
    };
    const rows = Object.fromEntries(aiPreviewRows(preview, "America/New_York"));
    expect(rows["员工"]).toBe("Amy");
    expect(rows["开始时间"]).toContain("15:00");
    expect(rows["结束时间"]).toBe("—");
    expect(rows["项目金额"]).toBe("$100.50");
    expect(rows["付款"]).toBe("现金大费 $100.50、刷卡小费 $12.34");
    expect(rows["额外项目"]).toBe("Hot stone $10.50");
    expect(rows["折扣"]).toBe("无");
  });
});
