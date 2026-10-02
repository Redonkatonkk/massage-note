import { afterEach, expect, it, vi } from "vitest";
import { createFeedbackTimer } from "./feedback-timer";

afterEach(() => vi.useRealTimers());

it("提示保持完整三秒后自动消失", () => {
  vi.useFakeTimers();
  const dismiss = vi.fn();
  const timer = createFeedbackTimer(dismiss);
  timer.restart();
  vi.advanceTimersByTime(2_999);
  expect(dismiss).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(dismiss).toHaveBeenCalledOnce();
});

it("重复触发或替换提示重新计时，旧计时不会清掉新提示", () => {
  vi.useFakeTimers();
  const dismiss = vi.fn();
  const timer = createFeedbackTimer(dismiss);
  timer.restart();
  vi.advanceTimersByTime(2_000);
  timer.restart();
  vi.advanceTimersByTime(1_000);
  expect(dismiss).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1_999);
  expect(dismiss).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1);
  expect(dismiss).toHaveBeenCalledOnce();
});

it("主动清除或组件卸载取消计时，后续提示仍可正常计时", () => {
  vi.useFakeTimers();
  const dismiss = vi.fn();
  const timer = createFeedbackTimer(dismiss);
  timer.restart();
  timer.cancel();
  vi.advanceTimersByTime(3_000);
  expect(dismiss).not.toHaveBeenCalled();
  timer.restart();
  vi.advanceTimersByTime(3_000);
  expect(dismiss).toHaveBeenCalledOnce();
});
