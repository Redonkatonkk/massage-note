import { afterEach, expect, it, vi } from "vitest";
import { browserStorage } from "./browser-storage";

afterEach(() => vi.unstubAllGlobals());

it("禁用浏览器存储时可以继续登录和保存服务端数据", () => {
  vi.stubGlobal("window", { get localStorage() { throw new Error("SecurityError"); } });
  expect(browserStorage.getItem("store")).toBeNull();
  expect(browserStorage.setItem("draft", "value")).toBe(false);
  expect(browserStorage.removeItem("draft")).toBe(false);
});

it("额度用尽时返回失败而不是让页面崩溃", () => {
  vi.stubGlobal("window", { localStorage: { setItem() { throw new Error("QuotaExceededError"); } } });
  expect(browserStorage.setItem("draft", "value")).toBe(false);
});
