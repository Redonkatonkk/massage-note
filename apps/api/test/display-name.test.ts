import { describe, expect, it } from "vitest";
import {
  normalizeDisplayName,
  profileDisplayName,
} from "../src/stores/display-name.js";

describe("店内显示名称", () => {
  it("统一全角字符、空格和大小写用于唯一性比较", () => {
    expect(normalizeDisplayName("  Ａｍｙ   LIN  ")).toBe("amy lin");
  });

  it("资料不完整时不生成店内名称", () => {
    expect(profileDisplayName({ firstName: "Amy", lastName: null })).toBeNull();
    expect(profileDisplayName({ firstName: "Amy", lastName: "Lin" })).toBe("Amy Lin");
  });
});
