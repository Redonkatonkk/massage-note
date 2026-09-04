import { describe, expect, it } from "vitest";
import {
  boardDateSchema,
  clockInSchema,
  createDispatchIntentSchema,
  reorderBoardSchema,
} from "../src/index.js";

describe("打卡与今日表格契约", () => {
  it("上班打卡不接受客户端伪造人员或时间", () => {
    expect(clockInSchema.safeParse({}).success).toBe(true);
    expect(clockInSchema.safeParse({ membershipId: "伪造" }).success).toBe(false);
  });

  it("validates dispatch intent kinds and selected employees", () => {
    const membershipId = "123e4567-e89b-42d3-a456-426614174000";
    expect(createDispatchIntentSchema.safeParse({ version: 1, kind: "REGULAR" }).success).toBe(true);
    expect(createDispatchIntentSchema.safeParse({ version: 1, kind: "CLIENT_REQUESTED" }).success).toBe(false);
    expect(createDispatchIntentSchema.safeParse({ version: 1, kind: "STORE_ASSIGNED", membershipId }).success).toBe(true);
  });

  it("营业日和排序列表必须有效", () => {
    expect(boardDateSchema.safeParse("2026-08-04").success).toBe(true);
    expect(boardDateSchema.safeParse("08/04/2026").success).toBe(false);
    expect(reorderBoardSchema.safeParse({ version: 1, rowIds: [] }).success).toBe(
      false,
    );
  });
});
