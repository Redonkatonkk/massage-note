import { describe, expect, it } from "vitest";
import {
  setEmployeeDefaultCommissionSchema,
  setEmployeeItemCommissionSchema,
} from "../src/index.js";

describe("提成设置契约", () => {
  it("允许明确清除员工默认提成", () => {
    expect(
      setEmployeeDefaultCommissionSchema.parse({
        version: 1,
        commissionBps: null,
      }),
    ).toEqual({ version: 1, commissionBps: null });
  });

  it("员工项目特殊提成只接受主要项目和额外项目", () => {
    expect(
      setEmployeeItemCommissionSchema.safeParse({
        version: 1,
        itemType: "DISCOUNT",
        itemId: "115e9be0-c76e-4d8d-bcec-55618c74450e",
        commissionBps: 5_000,
      }).success,
    ).toBe(false);
  });
});
