import { describe, expect, it } from "vitest";
import {
  calendarDateRangeQuerySchema,
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

  it("财务查询默认全部付款方式和全部金额，并解析员工列表", () => {
    expect(
      financeQuerySchema.parse({
        membershipIds:
          "56d4a93a-5a73-49df-93c2-704ae844faa4,115e9be0-c76e-4d8d-bcec-55618c74450e",
      }),
    ).toMatchObject({
      paymentMethod: "ALL",
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

  it("财务查询只提供全部、现金和刷卡＋礼物卡三种来源", () => {
    expect(financeQuerySchema.parse({ paymentMethod: "NON_CASH" }).paymentMethod).toBe("NON_CASH");
    expect(financeQuerySchema.safeParse({ paymentMethod: "CARD" }).success).toBe(false);
    expect(financeQuerySchema.safeParse({ paymentMethod: "GIFT_CARD" }).success).toBe(false);
  });

  it("日历查询只接受不超过 63 天的正向日期范围", () => {
    expect(
      calendarDateRangeQuerySchema.safeParse({
        dateFrom: "2026-08-01",
        dateTo: "2026-08-31",
      }).success,
    ).toBe(true);
    expect(
      calendarDateRangeQuerySchema.safeParse({
        dateFrom: "2026-08-31",
        dateTo: "2026-08-01",
      }).success,
    ).toBe(false);
    expect(
      calendarDateRangeQuerySchema.safeParse({
        dateFrom: "2026-01-01",
        dateTo: "2026-04-01",
      }).success,
    ).toBe(false);
  });
});
