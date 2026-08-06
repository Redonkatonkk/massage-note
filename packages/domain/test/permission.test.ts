import { describe, expect, it } from "vitest";
import {
  canReadEmployeeFinance,
  canWriteWorkRecord,
  hasStoreCapability,
} from "../src/index.js";

describe("店铺角色权限", () => {
  it("员工能修改当天全员记工，但不能修改历史或已日结记录", () => {
    expect(
      canWriteWorkRecord({
        role: "EMPLOYEE",
        isCurrentBusinessDay: true,
        isDayClosed: false,
      }),
    ).toBe(true);
    expect(
      canWriteWorkRecord({
        role: "EMPLOYEE",
        isCurrentBusinessDay: false,
        isDayClosed: false,
      }),
    ).toBe(false);
    expect(
      canWriteWorkRecord({
        role: "OWNER",
        isCurrentBusinessDay: true,
        isDayClosed: true,
      }),
    ).toBe(false);
  });

  it("经理有管理权但不能转移拥有者或删除店铺", () => {
    expect(hasStoreCapability("MANAGER", "PAYROLL_MANAGE")).toBe(true);
    expect(hasStoreCapability("MANAGER", "OWNER_TRANSFER")).toBe(false);
    expect(hasStoreCapability("MANAGER", "STORE_DELETE")).toBe(false);
  });

  it("员工只能查看自己的历史财务", () => {
    expect(
      canReadEmployeeFinance({
        role: "EMPLOYEE",
        actorMembershipId: "amy",
        targetMembershipId: "amy",
      }),
    ).toBe(true);
    expect(
      canReadEmployeeFinance({
        role: "EMPLOYEE",
        actorMembershipId: "amy",
        targetMembershipId: "lisa",
      }),
    ).toBe(false);
    expect(
      canReadEmployeeFinance({
        role: "MANAGER",
        actorMembershipId: "manager",
        targetMembershipId: "lisa",
      }),
    ).toBe(true);
  });
});

