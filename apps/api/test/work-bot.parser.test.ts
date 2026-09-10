import { describe, expect, it } from "vitest";
import { parseWorkBotMessage, parsedIntentAppearsInRawText } from "../src/work-bot/work-bot.parser.js";

describe("记工机器人固定语法", () => {
  it.each([
    ["高亮", true], ["取消高亮", false], ["去掉高亮", false],
    ["移除高亮", false], ["关闭高亮", false], ["不高亮", false],
    ["highlight", true], ["unhighlight", false], ["取消 高亮", false],
  ])("解析并校验高亮操作 %s", (command, state) => {
    for (const text of [command, `Lily ${command}`, `${command} 11111111-1111-4111-8111-111111111111`]) {
      const intent = parseWorkBotMessage(text);
      expect(intent).toMatchObject({ kind: "ADJUST", isHighlighted: state });
      expect(parsedIntentAppearsInRawText(intent, text)).toBe(true);
    }
  });

  it.each([["高亮", true], ["取消高亮", false]] as const)("下工合并 %s", (command, state) => {
    const text = `Lily 下工 75 5 卡 ${command}`;
    const intent = parseWorkBotMessage(text);
    expect(intent).toMatchObject({ kind: "FINISH", memberName: "Lily", isHighlighted: state });
    expect(parsedIntentAppearsInRawText(intent, text)).toBe(true);
  });

  it("取消操作不能截取高亮二字后反向执行", () => {
    for (const raw of ["Lily 取消高亮", "Lily 去掉高亮", "Lily 不要高亮", "Lily 不要取消高亮", "如何高亮？"]) {
      expect(parsedIntentAppearsInRawText({ kind: "ADJUST", isHighlighted: true, highlightMention: "高亮" }, raw)).toBe(false);
    }
    const recordId = "11111111-1111-4111-8111-111111111111";
    const raw = `去掉高亮 ${recordId}`;
    expect(parsedIntentAppearsInRawText({ kind: "MANAGE", operation: "UPDATE", recordId, evidence: raw, details: { isHighlighted: false } }, raw)).toBe(true);
    expect(parsedIntentAppearsInRawText({ kind: "MANAGE", operation: "UPDATE", recordId, evidence: raw, details: { isHighlighted: true } }, raw)).toBe(false);
  });

  it("接受 AI 按店铺约定解释的下工简写，保留姓名并验证实际金额和显式付款方式", () => {
    const intent = { kind: "FINISH" as const, memberName: "Jessica", memberMention: "Jessica", serviceAmount: "75", tipAmount: "5", paymentMethod: "CARD" as const, paymentMention: "Jessica 75 5" };
    expect(parsedIntentAppearsInRawText(intent, "Jessica 75 5")).toBe(true);
    expect(parsedIntentAppearsInRawText(intent, "Jessica 75 5 现金")).toBe(false);
    expect(parsedIntentAppearsInRawText(intent, "Jessica 90 0")).toBe(false);
    expect(parsedIntentAppearsInRawText(intent, "Lily 75 5")).toBe(false);
  });
  it("时长必须匹配完整数字而不是子串", () => {
    expect(parsedIntentAppearsInRawText({ kind: "START", serviceAlias: "脚", durationMinutes: 60 }, "脚160分钟")).toBe(false);
    expect(parsedIntentAppearsInRawText({ kind: "START", serviceAlias: "脚", durationMinutes: 60, durationMention: "" }, "脚160分钟")).toBe(false);
    expect(parsedIntentAppearsInRawText({ kind: "START", serviceAlias: "脚", durationMinutes: 60 }, "脚60分钟")).toBe(true);
    expect(parsedIntentAppearsInRawText({ kind: "START", serviceAlias: "脚", durationMinutes: 60, durationMention: "160分钟" }, "脚160分钟")).toBe(false);
    expect(parsedIntentAppearsInRawText({ kind: "START", serviceAlias: "脚", durationMinutes: 60, durationMention: "1小时" }, "脚1小时")).toBe(true);
  });

  it.each(["下工 -80 20现金", "下工 80.123 20现金", "下工 80 20现金刷卡", "下工 80 20礼物卡"])("拒绝不明确的付款 %s", (text) => {
    expect(parseWorkBotMessage(text)).toEqual({ kind: "HELP" });
    expect(parsedIntentAppearsInRawText({ kind: "FINISH", serviceAmount: "80", tipAmount: "20", paymentMethod: "CASH" }, text)).toBe(false);
  });

  it("不能交换或重复使用原文金额", () => {
    expect(parsedIntentAppearsInRawText({ kind: "FINISH", serviceAmount: "20", tipAmount: "80", paymentMethod: "CASH" }, "下工80 20现金")).toBe(false);
    expect(parsedIntentAppearsInRawText({ kind: "FINISH", serviceAmount: "80", tipAmount: "80", paymentMethod: "CASH" }, "下工80现金")).toBe(false);
  });
  it.each([
    ["@记工助手 绑定店铺 123456", { kind: "BIND_STORE", storeCode: "123456" }],
    ["@记工助手 绑定 张三", { kind: "BIND_MEMBER", memberName: "张三" }],
    ["@记工助手 我上工了，一小时身体", { kind: "START", serviceAlias: "一小时身体" }],
    ["上工，大力", { kind: "START", serviceAlias: "大力" }],
    ["开始大力90", { kind: "START", serviceAlias: "大力90" }],
    ["大力 90", { kind: "START", serviceAlias: "大力", durationMinutes: 90 }],
    ["Jessie 脚 30", { kind: "START", serviceAlias: "脚", durationMinutes: 30, memberName: "Jessie" }],
    ["上工 Jessie 脚 30分钟", { kind: "START", serviceAlias: "脚", durationMinutes: 30, memberName: "Jessie" }],
    ["我下了，80 20 现金", { kind: "FINISH", serviceAmount: "80", tipAmount: "20", paymentMethod: "CASH" }],
    ["lily 下了，收 75/15卡，评论", { kind: "FINISH", memberName: "lily", serviceAmount: "75", tipAmount: "15", paymentMethod: "CARD", discounts: [{ name: "评论", mention: "评论" }] }],
    ["下工 80 10 卡", { kind: "FINISH", serviceAmount: "80", tipAmount: "10", paymentMethod: "CARD" }],
  ])("解析 %s", (message, expected) => {
    expect(parseWorkBotMessage(message)).toEqual(expected);
  });

  it("付款字段不完整或普通聊天时不产生可写意图", () => {
    expect(parseWorkBotMessage("我下了，80 现金")).toEqual({ kind: "HELP" });
    expect(parseWorkBotMessage("帮我删除昨天的账")).toEqual({ kind: "HELP" });
  });

  it("拒绝模型补写原文不存在的金额和付款方式", () => {
    expect(parsedIntentAppearsInRawText({ kind: "FINISH", serviceAmount: "80", tipAmount: "20", paymentMethod: "CARD" }, "我下了 80 20 现金")).toBe(false);
    expect(parsedIntentAppearsInRawText({ kind: "START", serviceAlias: "大力90" }, "我上工了，大力")).toBe(false);
    expect(parsedIntentAppearsInRawText({ kind: "START", serviceAlias: "脚", durationMinutes: 60, memberName: "Jessie" }, "Jessie 脚 30")).toBe(false);
    expect(parsedIntentAppearsInRawText({ kind: "START", serviceAlias: "脚", durationMinutes: 30, memberName: "Amy" }, "Jessie 脚 30")).toBe(false);
  });

  it("允许 AI 用逐字证据把自然语言映射为技能中的标准黑话和员工", () => {
    expect(parsedIntentAppearsInRawText({
      kind: "START",
      serviceAlias: "脚",
      serviceMention: "feet",
      durationMinutes: 60,
      durationMention: "一小时",
      memberName: "Jessie",
      memberMention: "小J",
    }, "小J 做 feet 一小时")).toBe(true);
    expect(parsedIntentAppearsInRawText({
      kind: "START",
      serviceAlias: "脚",
      serviceMention: "feet",
    }, "做全身一小时")).toBe(false);
  });
});
