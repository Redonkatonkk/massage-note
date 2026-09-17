import { describe, expect, it } from "vitest";
import { workBotParsedIntentSchema } from "../src/work-bot.js";

describe("多人记工契约", () => {
  const actions = ["Ling", "Jessie"].map(memberName => ({ kind: "START", memberName, memberMention: memberName, serviceAlias: "大力" }));
  it("保留两位员工及各自操作", () => {
    expect(workBotParsedIntentSchema.parse({ kind: "BATCH", actions })).toEqual({ kind: "BATCH", actions });
  });
  it("拒绝重复人员、无明确人员、编号扩散和嵌套", () => {
    for (const children of [[actions[0]], [actions[0], actions[0]], [actions[0], { ...actions[1], memberName: undefined }], [actions[0], { ...actions[1], memberMention: undefined }], [actions[0], { kind: "ADJUST", memberName: "Jessie", memberMention: "Jessie", recordId: "11111111-1111-4111-8111-111111111111", isHighlighted: true }], [actions[0], { kind: "BATCH", actions }]]) {
      expect(workBotParsedIntentSchema.safeParse({ kind: "BATCH", actions: children }).success).toBe(false);
    }
  });
});
