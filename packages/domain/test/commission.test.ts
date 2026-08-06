import { describe, expect, it } from "vitest";
import {
  resolveCommission,
  resolveCustomItemCommission,
} from "../src/index.js";

describe("提成优先级", () => {
  it("员工项目特殊比例优先", () => {
    expect(
      resolveCommission({
        employeeItemBps: 7_000,
        itemDefaultBps: 6_500,
        employeeDefaultBps: 6_000,
        storeDefaultBps: 5_500,
      }),
    ).toEqual({ bps: 7_000, source: "EMPLOYEE_ITEM" });
  });

  it("依次回退到项目、员工和店铺默认比例", () => {
    expect(
      resolveCommission({
        itemDefaultBps: 6_500,
        employeeDefaultBps: 6_000,
        storeDefaultBps: 5_500,
      }).source,
    ).toBe("ITEM_DEFAULT");
    expect(
      resolveCommission({
        employeeDefaultBps: 6_000,
        storeDefaultBps: 5_500,
      }).source,
    ).toBe("EMPLOYEE_DEFAULT");
    expect(resolveCommission({ storeDefaultBps: 5_500 }).source).toBe(
      "STORE_DEFAULT",
    );
  });

  it("自定义项目跳过项目层级", () => {
    expect(
      resolveCustomItemCommission({
        employeeDefaultBps: 6_200,
        storeDefaultBps: 5_500,
      }),
    ).toEqual({ bps: 6_200, source: "EMPLOYEE_DEFAULT" });
  });
});

