import { describe, expect, it } from "vitest";
import {
  approveJoinRequestSchema,
  createEmployeeSchema,
  createStoreSchema,
  storeCodeSchema,
  transferOwnerSchema,
  updateStoreSchema,
  updateMembershipSchema,
} from "../src/index.js";

describe("门店输入契约", () => {
  it("接受有效门店设置并补充默认截止时间", () => {
    expect(
      createStoreSchema.parse({
        storeCode: "123456",
        name: "安心按摩",
        timezone: "America/New_York",
        globalCommissionBps: 6_000,
      }),
    ).toEqual({
      storeCode: "123456",
      name: "安心按摩",
      timezone: "America/New_York",
      businessCutoffLocal: "22:00",
      globalCommissionBps: 6_000,
    });
  });

  it("拒绝无效时区、截止时间和店铺代码", () => {
    expect(
      createStoreSchema.safeParse({
        storeCode: "12345",
        name: "安心按摩",
        timezone: "不存在的时区",
        businessCutoffLocal: "25:00",
        globalCommissionBps: 6_000,
      }).success,
    ).toBe(false);
    expect(storeCodeSchema.safeParse("12345").success).toBe(false);
  });

  it("审批申请时默认建立参与记工的员工", () => {
    expect(approveJoinRequestSchema.parse({ version: 1 })).toEqual({
      version: 1,
      role: "EMPLOYEE",
      isServiceProvider: true,
    });
  });

  it("店长创建员工时只需要名字", () => {
    expect(createEmployeeSchema.parse({ name: "  小林  " })).toEqual({
      name: "小林",
    });
    expect(createEmployeeSchema.safeParse({ name: "   " }).success).toBe(false);
    expect(
      createEmployeeSchema.safeParse({ name: "小林", lastName: "陈" }).success,
    ).toBe(true);
  });

  it("拒绝通过成员修改接口直接授予 Owner", () => {
    expect(
      updateMembershipSchema.safeParse({ version: 1, role: "OWNER" }).success,
    ).toBe(false);
  });

  it("成员更新至少包含一个实际修改字段", () => {
    expect(updateMembershipSchema.safeParse({ version: 1 }).success).toBe(false);
  });

  it("校验个人日结短信号码和语言设置", () => {
    expect(updateMembershipSchema.safeParse({ version: 1, closingDeliveryEnabled: true, closingDeliveryPhoneE164: "+16465551234", closingImageLocale: "en_US" }).success).toBe(true);
    expect(updateMembershipSchema.safeParse({ version: 1, closingDeliveryPhoneE164: "6465551234" }).success).toBe(false);
    expect(updateStoreSchema.safeParse({ version: 1, closingDefaultLocale: "zh_CN" }).success).toBe(true);
  });

  it("店铺设置更新需要版本号和至少一个字段", () => {
    expect(updateStoreSchema.safeParse({ version: 1 }).success).toBe(false);
    expect(
      updateStoreSchema.safeParse({
        version: 1,
        businessCutoffLocal: "21:30",
      }).success,
    ).toBe(true);
  });

  it("周一至周四自动折扣必须完整配置有效门槛和额度", () => {
    expect(
      updateStoreSchema.safeParse({
        version: 1,
        mondayThursdayAutoDiscountEnabled: true,
        mondayThursdayAutoDiscountThresholdCents: 10_000,
        mondayThursdayAutoDiscountAmountCents: 1_000,
      }).success,
    ).toBe(true);
    expect(
      updateStoreSchema.safeParse({
        version: 1,
        mondayThursdayAutoDiscountEnabled: true,
        mondayThursdayAutoDiscountThresholdCents: 1_000,
        mondayThursdayAutoDiscountAmountCents: 2_000,
      }).success,
    ).toBe(false);
    expect(
      updateStoreSchema.safeParse({
        version: 1,
        mondayThursdayAutoDiscountEnabled: true,
      }).success,
    ).toBe(false);
    expect(
      updateStoreSchema.safeParse({
        version: 1,
        mondayThursdayAutoDiscountEnabled: false,
        mondayThursdayAutoDiscountThresholdCents: 0,
        mondayThursdayAutoDiscountAmountCents: 0,
      }).success,
    ).toBe(true);
  });

  it("礼物卡自动折扣必须完整配置门槛和有效百分比", () => {
    expect(updateStoreSchema.safeParse({
      version: 1,
      giftCardAutoDiscountEnabled: true,
      giftCardAutoDiscountThresholdCents: 10_000,
      giftCardAutoDiscountBps: 500,
    }).success).toBe(true);
    expect(updateStoreSchema.safeParse({
      version: 1,
      giftCardAutoDiscountEnabled: true,
      giftCardAutoDiscountThresholdCents: 10_000,
    }).success).toBe(false);
    expect(updateStoreSchema.safeParse({
      version: 1,
      giftCardAutoDiscountEnabled: true,
      giftCardAutoDiscountThresholdCents: 10_000,
      giftCardAutoDiscountBps: 10_000,
    }).success).toBe(false);
    expect(updateStoreSchema.safeParse({
      version: 1,
      giftCardAutoDiscountEnabled: false,
      giftCardAutoDiscountThresholdCents: 0,
      giftCardAutoDiscountBps: 0,
    }).success).toBe(true);
  });

  it("Owner 转移必须指定有效成员编号", () => {
    expect(
      transferOwnerSchema.safeParse({
        version: 1,
        newOwnerMembershipId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });
});
