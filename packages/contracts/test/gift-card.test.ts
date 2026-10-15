import { describe, expect, it } from "vitest";
import {
  createGiftCardSaleSchema,
  restoreGiftCardSaleSchema,
  updateGiftCardSaleSchema,
} from "../src/index.js";

const membershipId = "56d4a93a-5a73-49df-93c2-704ae844faa4";

describe("礼物卡销售契约", () => {
  it("网上卖卡要求文本用户名，保留数字前导零且不要求系统用户编号", () => {
    const input = { businessDate: "2026-10-15", isOnline: true, serialNumber: " 001001 ", cashCents: 1000, operatorMembershipId: membershipId };
    expect(createGiftCardSaleSchema.parse(input)).toMatchObject({ isOnline: true, serialNumber: "001001" });
    expect(createGiftCardSaleSchema.safeParse({ ...input, serialNumber: undefined }).success).toBe(false);
    expect(createGiftCardSaleSchema.safeParse({ ...input, serialNumber: 1001 }).success).toBe(false);
    expect(updateGiftCardSaleSchema.safeParse({ version: 1, isOnline: true }).success).toBe(false);
  });
  it("新界面可提交面值，序列号可由后端自动生成，缺省付款方式按 0 处理", () => {
    expect(createGiftCardSaleSchema.parse({
      businessDate: "2026-08-20",
      faceValueCents: 10_000,
      cardCents: 10_000,
      operatorMembershipId: membershipId,
    })).toEqual({
      businessDate: "2026-08-20",
      faceValueCents: 10_000,
      cashCents: 0,
      cardCents: 10_000,
      operatorMembershipId: membershipId,
    });
  });

  it("兼容旧客户端省略面值，由服务端按原付款合计保存", () => {
    expect(createGiftCardSaleSchema.parse({
      businessDate: "2026-08-20",
      serialNumber: " GC-OLD-1 ",
      cashCents: 5_000,
      operatorMembershipId: membershipId,
    })).toMatchObject({
      serialNumber: "GC-OLD-1",
      cashCents: 5_000,
      cardCents: 0,
    });
  });

  it("拒绝零金额销售和只有版本的空修改", () => {
    expect(createGiftCardSaleSchema.safeParse({
      businessDate: "2026-08-20",
      serialNumber: "GC-1002",
      faceValueCents: 10_000,
      operatorMembershipId: membershipId,
    }).success).toBe(false);
    expect(updateGiftCardSaleSchema.safeParse({ version: 1 }).success).toBe(false);
  });

  it("恢复请求必须携带有效版本", () => {
    expect(restoreGiftCardSaleSchema.parse({ version: 2 })).toEqual({ version: 2 });
    expect(restoreGiftCardSaleSchema.safeParse({ version: 0 }).success).toBe(false);
  });
});
