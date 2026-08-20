import { describe, expect, it } from "vitest";
import {
  closeBusinessDaySchema,
  createPayrollSettlementSchema,
  financeQuerySchema,
} from "../src/index.js";

describe("日结与财务契约", () => {
  it("强制日结必须填写原因", () => {
    expect(closeBusinessDaySchema.safeParse({ force: true }).success).toBe(false);
    expect(
      closeBusinessDaySchema.parse({ force: true, forceReason: "待结账稍后补" }),
    ).toEqual({ force: true, forceReason: "待结账稍后补" });
  });

  it("负数工资支付总额必须附二次确认原因", () => {
    const base = {
      membershipId: "56d4a93a-5a73-49df-93c2-704ae844faa4",
      settlementDate: "2026-08-04",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-04",
      serviceWageCents: 0,
      cashTipCents: 0,
      cardTipCents: 0,
      adjustmentCents: -100,
      paymentMethod: "OTHER" as const,
      note: "冲减",
    };
    expect(createPayrollSettlementSchema.safeParse(base).success).toBe(false);
    expect(
      createPayrollSettlementSchema.safeParse({
        ...base,
        negativeTotalReason: "修正重复支付",
      }).success,
    ).toBe(true);
  });

  it("财务查询默认刷卡和全部金额，并解析员工列表", () => {
    expect(
      financeQuerySchema.parse({
        membershipIds:
          "56d4a93a-5a73-49df-93c2-704ae844faa4,115e9be0-c76e-4d8d-bcec-55618c74450e",
      }),
    ).toMatchObject({
      paymentMethod: "CARD",
      amountType: "ALL",
      highlightFilter: "ALL",
      membershipIds: [
        "56d4a93a-5a73-49df-93c2-704ae844faa4",
        "115e9be0-c76e-4d8d-bcec-55618c74450e",
      ],
    });
  });

  it("财务查询接受三种高亮筛选", () => {
    for (const highlightFilter of [
      "ALL",
      "ONLY_HIGHLIGHTED",
      "EXCLUDE_HIGHLIGHTED",
    ] as const) {
      expect(financeQuerySchema.parse({ highlightFilter }).highlightFilter).toBe(
        highlightFilter,
      );
    }
  });
});
