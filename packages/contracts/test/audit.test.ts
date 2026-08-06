import { describe, expect, it } from "vitest";
import { auditLogQuerySchema, catalogListQuerySchema } from "../src/index.js";

describe("审计与回收站查询契约", () => {
  it("补齐分页默认值并校验日期范围", () => {
    expect(auditLogQuerySchema.parse({})).toEqual({ limit: 30 });
    expect(auditLogQuerySchema.safeParse({ dateFrom: "2026-08-05", dateTo: "2026-08-04" }).success).toBe(false);
  });

  it("把项目回收站开关转换为布尔值", () => {
    expect(catalogListQuerySchema.parse({}).includeDeleted).toBe(false);
    expect(catalogListQuerySchema.parse({ includeDeleted: "true" }).includeDeleted).toBe(true);
  });
});
