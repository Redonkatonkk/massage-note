import { describe, expect, it } from "vitest";
import {
  addonInputSchema,
  confirmPaymentSchema,
  createWorkRecordSchema,
  updateWorkRecordSchema,
} from "../src/index.js";

describe("付款确认契约", () => {
  it("每组填写一项后把另一项补为 0", () => {
    expect(
      confirmPaymentSchema.parse({
        version: 1,
        cashServiceCents: 10_000,
        cardTipCents: 2_000,
      }),
    ).toEqual({
      version: 1,
      cashServiceCents: 10_000,
      cardServiceCents: 0,
      cashTipCents: 0,
      cardTipCents: 2_000,
    });
  });

  it("明确输入 0 是有效值", () => {
    expect(
      confirmPaymentSchema.safeParse({
        version: 1,
        cashServiceCents: 0,
        cashTipCents: 0,
      }).success,
    ).toBe(true);
  });

  it("小费可以全部留空并按 0 处理，但大费不能全部留空", () => {
    expect(confirmPaymentSchema.parse({
      version: 1,
      cardServiceCents: 10_000,
    })).toEqual({
      version: 1,
      cashServiceCents: 0,
      cardServiceCents: 10_000,
      cashTipCents: 0,
      cardTipCents: 0,
    });

    const result = confirmPaymentSchema.safeParse({ version: 1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toHaveLength(1);
      expect(result.error.issues[0]?.path).toEqual(["cashServiceCents"]);
    }
  });
});

describe("记工项目来源契约", () => {
  const membershipId = "56d4a93a-5a73-49df-93c2-704ae844faa4";
  const itemId = "115e9be0-c76e-4d8d-bcec-55618c74450e";

  it("自定义主要项目只接收自定义内容，不伪装成预设项目", () => {
    expect(
      createWorkRecordSchema.safeParse({
        employeeMembershipId: membershipId,
        startAt: "2026-08-04T14:00:00-04:00",
        customService: {
          name: "自定义 75 分钟",
          shortName: "75分",
          amountCents: 12_000,
          durationMinutes: 75,
        },
      }).success,
    ).toBe(true);
  });

  it("修改主要项目时不能同时选择预设和自定义项目", () => {
    expect(
      updateWorkRecordSchema.safeParse({
        version: 1,
        serviceItemId: itemId,
        serviceDurationMinutes: 60,
        customService: {
          name: "自定义",
          shortName: "自定",
          amountCents: 10_000,
          durationMinutes: 60,
        },
      }).success,
    ).toBe(false);
  });

  it("详情修改接受单笔提成与人工结算标记", () => {
    expect(
      updateWorkRecordSchema.parse({
        version: 2,
        mainServiceCommissionBps: 6_500,
        tipSettledManualFlag: true,
        largeFeeSettledManualFlag: false,
      }),
    ).toEqual({
      version: 2,
      mainServiceCommissionBps: 6_500,
      tipSettledManualFlag: true,
      largeFeeSettledManualFlag: false,
    });
  });

  it("详情修改可为单笔记工停用自动折扣", () => {
    expect(
      updateWorkRecordSchema.parse({
        version: 3,
        automaticDiscountSuppressed: true,
      }),
    ).toEqual({
      version: 3,
      automaticDiscountSuppressed: true,
    });
  });

  it("预设加项必须带项目编号，自定义加项不能带项目编号", () => {
    expect(
      addonInputSchema.safeParse({
        isCustom: false,
        name: "热石",
        shortName: "热石",
        amountCents: 2_000,
      }).success,
    ).toBe(false);
    expect(
      addonInputSchema.safeParse({
        sourceItemId: itemId,
        isCustom: true,
        name: "自定义热石",
        shortName: "热石",
        amountCents: 2_000,
      }).success,
    ).toBe(false);
  });
});
