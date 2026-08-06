import { describe, expect, it } from "vitest";
import {
  approveJoinRequestSchema,
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

  it("拒绝通过成员修改接口直接授予 Owner", () => {
    expect(
      updateMembershipSchema.safeParse({ version: 1, role: "OWNER" }).success,
    ).toBe(false);
  });

  it("成员更新至少包含一个实际修改字段", () => {
    expect(updateMembershipSchema.safeParse({ version: 1 }).success).toBe(false);
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

  it("Owner 转移必须指定有效成员编号", () => {
    expect(
      transferOwnerSchema.safeParse({
        version: 1,
        newOwnerMembershipId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });
});
