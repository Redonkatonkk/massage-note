import { describe, expect, it } from "vitest";
import {
  hasBlockingClosingWarnings,
  homeClosingAction,
  isBlockingClosingWarning,
} from "./closing";
import type { ClosingWarning } from "./types";

function warning(
  code: string,
  blocking?: boolean,
): ClosingWarning {
  return {
    code,
    labelZh: code,
    ...(blocking === undefined ? {} : { blocking }),
    count: 1,
    recordIds: ["record-1"],
  };
}

describe("日结提示分级", () => {
  it("手动改价只提醒，不阻止正常日结", () => {
    const manualPrice = warning("MANUAL_PRICE", false);
    expect(isBlockingClosingWarning(manualPrice)).toBe(false);
    expect(hasBlockingClosingWarnings([manualPrice])).toBe(false);
  });

  it("待结账等异常继续阻止正常日结", () => {
    expect(hasBlockingClosingWarnings([
      warning("MANUAL_PRICE", false),
      warning("PENDING_PAYMENT", true),
    ])).toBe(true);
  });

  it("兼容没有 blocking 字段的旧响应", () => {
    expect(isBlockingClosingWarning(warning("MANUAL_PRICE"))).toBe(false);
    expect(isBlockingClosingWarning(warning("PAYMENT_MISMATCH"))).toBe(true);
  });

  it("首页在检查通过或只有非阻塞提醒时直接正常日结", () => {
    expect(homeClosingAction({ isClosed: false, warnings: [] })).toBe("CLOSE");
    expect(homeClosingAction({
      isClosed: false,
      warnings: [warning("MANUAL_PRICE", false)],
    })).toBe("CLOSE");
  });

  it("首页遇到真正阻塞项时转到财务日结页面", () => {
    expect(homeClosingAction({
      isClosed: false,
      warnings: [warning("PENDING_PAYMENT", true)],
    })).toBe("REVIEW");
  });

  it("首页已日结状态提供取消日结操作", () => {
    expect(homeClosingAction({
      isClosed: true,
      warnings: [],
    })).toBe("CANCEL");
  });
});
