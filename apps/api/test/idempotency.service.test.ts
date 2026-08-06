import { describe, expect, it } from "vitest";
import { idempotencyRequestHash } from "../src/common/idempotency.service.js";

describe("幂等请求哈希", () => {
  it("对象字段顺序不同仍得到相同哈希", () => {
    expect(idempotencyRequestHash({ a: 1, b: { x: 2, y: 3 } })).toBe(
      idempotencyRequestHash({ b: { y: 3, x: 2 }, a: 1 }),
    );
  });

  it("不同请求内容得到不同哈希", () => {
    expect(idempotencyRequestHash({ amount: 100 })).not.toBe(
      idempotencyRequestHash({ amount: 101 }),
    );
  });
});
