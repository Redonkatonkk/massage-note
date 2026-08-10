import { describe, expect, it } from "vitest";
import {
  createCatalogItemSchema,
  initializeCatalogSchema,
  updateCatalogItemSchema,
} from "../src/index.js";

describe("项目初始化契约", () => {
  it("至少需要一个主要项目并补齐空的额外项目与折扣", () => {
    expect(
      initializeCatalogSchema.parse({
        serviceItems: [
          {
            fullName: "60 分钟按摩",
            shortName: "60分",
            priceOptions: [{ durationMinutes: 60, priceCents: 10_000 }],
          },
        ],
      }),
    ).toEqual({
      serviceItems: [
        {
          fullName: "60 分钟按摩",
          shortName: "60分",
          priceOptions: [{ durationMinutes: 60, priceCents: 10_000 }],
        },
      ],
      addonItems: [],
      discountItems: [],
    });
    expect(initializeCatalogSchema.safeParse({ serviceItems: [] }).success).toBe(
      false,
    );
  });

  it("逐项维护时按项目类型校验字段", () => {
    expect(
      createCatalogItemSchema.safeParse({
        type: "SERVICE",
        fullName: "90 分钟按摩",
        shortName: "90分",
        priceOptions: [
          { durationMinutes: 60, priceCents: 10_000 },
          { durationMinutes: 90, priceCents: 15_000 },
        ],
      }).success,
    ).toBe(true);
    expect(
      createCatalogItemSchema.safeParse({
        type: "SERVICE",
        fullName: "重复时长",
        shortName: "重复",
        priceOptions: [
          { durationMinutes: 60, priceCents: 10_000 },
          { durationMinutes: 60, priceCents: 12_000 },
        ],
      }).success,
    ).toBe(false);
    expect(
      createCatalogItemSchema.safeParse({
        type: "DISCOUNT",
        fullName: "字段错误",
      }).success,
    ).toBe(false);
    expect(
      updateCatalogItemSchema.safeParse({
        type: "ADDON",
        version: 1,
        amountCents: 2_000,
      }).success,
    ).toBe(true);
  });
});
