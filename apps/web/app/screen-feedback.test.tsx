// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useScreenFeedback } from "./screen-feedback";

let root: Root;
let container: HTMLDivElement;
let show: (text: string) => void;
let fail: (text: string) => void;

function Harness() {
  const { feedback, setNotice, setError } = useScreenFeedback();
  show = setNotice; fail = setError;
  return <><button>Keep focus</button><div className="board">Work cards</div>{feedback}</>;
}

beforeEach(async () => {
  vi.useFakeTimers();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<Harness />));
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove(); vi.useRealTimers();
});

it("keeps board layout and focus unchanged, starts fading after 2s and then removes the portal", async () => {
  const before = container.innerHTML;
  const button = container.querySelector("button")!; button.focus();
  await act(async () => show("记工修改已保存"));
  const notice = document.querySelector(".screen-feedback[role=status]")!;
  expect(notice.textContent).toContain("记工修改已保存"); expect(notice.getAttribute("aria-atomic")).toBe("true");
  expect(notice.parentElement).toBe(document.body); expect(container.innerHTML).toBe(before);
  expect(document.activeElement).toBe(button);
  await act(async () => vi.advanceTimersByTime(1999)); expect(notice.classList.contains("is-leaving")).toBe(false);
  await act(async () => vi.advanceTimersByTime(1)); expect(notice.classList.contains("is-leaving")).toBe(true);
  await act(async () => vi.advanceTimersByTime(200)); expect(document.querySelector(".screen-feedback")).toBeNull();
  expect(container.innerHTML).toBe(before); expect(document.activeElement).toBe(button);
});

it("repeated text restarts its full lifetime; errors replace previous success feedback", async () => {
  await act(async () => show("记工已保存"));
  await act(async () => vi.advanceTimersByTime(2100));
  await act(async () => show("记工已保存"));
  expect(document.querySelector(".screen-feedback.is-leaving")).toBeNull();
  await act(async () => vi.advanceTimersByTime(1800));
  expect(document.querySelector(".screen-feedback")!.textContent).toContain("记工已保存");
  await act(async () => fail("版本冲突"));
  expect(document.querySelectorAll(".screen-feedback")).toHaveLength(1);
  expect(document.querySelector(".screen-feedback--error[role=alert]")!.textContent).toBe("版本冲突");
  await act(async () => vi.advanceTimersByTime(1999)); expect(document.querySelector(".screen-feedback.is-leaving")).toBeNull();
  await act(async () => vi.advanceTimersByTime(201)); expect(document.querySelector(".screen-feedback")).toBeNull();
});

it("clears pending timers when feedback is cleared or the board unmounts", async () => {
  await act(async () => show("占位已删除"));
  expect(vi.getTimerCount()).toBe(2);
  await act(async () => fail("")); expect(document.querySelector(".screen-feedback")).toBeNull(); expect(vi.getTimerCount()).toBe(0);
  await act(async () => fail("请求失败"));
  await act(async () => root.render(<div />)); expect(document.querySelector(".screen-feedback")).toBeNull(); expect(vi.getTimerCount()).toBe(0);
});
