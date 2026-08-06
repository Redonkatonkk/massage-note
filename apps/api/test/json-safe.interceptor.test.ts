import { describe, expect, it } from "vitest";
import { toJsonSafe } from "../src/common/json-safe.interceptor.js";

describe("JSON 金额序列化", () => {
  it("把安全范围内的 BigInt 金额转为 JSON 数字", () => {
    expect(toJsonSafe({ amountCents: 12_345n, nested: [1n] })).toEqual({
      amountCents: 12_345,
      nested: [1],
    });
  });

  it("拒绝静默丢失超大整数精度", () => {
    expect(() => toJsonSafe(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(
      RangeError,
    );
  });

  it("尊重 Decimal 等对象自己的 JSON 表示", () => {
    expect(
      toJsonSafe({
        value: { toJSON: () => "1.2500000000" },
      }),
    ).toEqual({ value: "1.2500000000" });
  });
});
