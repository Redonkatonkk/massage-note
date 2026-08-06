import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import { apiErrorFromException } from "../src/common/api-exception.filter.js";

describe("统一 API 错误", () => {
  it("保留业务错误并补充请求编号", () => {
    expect(
      apiErrorFromException(
        new BadRequestException({ code: "BAD_INPUT", messageZh: "输入不正确" }),
        "request-123",
      ),
    ).toEqual({
      status: 400,
      payload: {
        code: "BAD_INPUT",
        messageZh: "输入不正确",
        requestId: "request-123",
      },
    });
  });

  it("不向客户端泄露未知异常信息", () => {
    const result = apiErrorFromException(new Error("数据库密码泄露"), "request-456");
    expect(result.status).toBe(500);
    expect(result.payload.messageZh).not.toContain("数据库密码");
  });
});
