import { expect, it } from "vitest";
import { wrapImageText } from "./ranking-image";
it("keeps all Chinese, emoji and long text across wrapped lines", () => {
  const text = "员工😀排序依据ABCDEFGHIJ";
  const lines = wrapImageText(text, 4, (value) => [...value].length);
  expect(lines.join("")).toBe(text);
  expect(lines.every((line) => [...line].length <= 4)).toBe(true);
});
it("preserves paragraph spacing", () => {
  expect(wrapImageText("日期\n\n员工", 10, (value) => value.length)).toEqual(["日期", "", "员工"]);
});
