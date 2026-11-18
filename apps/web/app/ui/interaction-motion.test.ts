// @vitest-environment jsdom

import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { animateOverlayExit, scrollConversationToEnd, withButtonMotion } from "./interaction-motion";

let finish: () => void;
let animate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  const finished = new Promise<void>(resolve => { finish = resolve; });
  animate = vi.fn(() => ({ finished }));
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true })));
  vi.stubGlobal("Element", window.Element);
  Object.defineProperty(window.Element.prototype, "animate", { configurable: true, value: animate });
});

afterEach(() => {
  Reflect.deleteProperty(window.Element.prototype, "animate");
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

function panel() {
  const element = document.createElement("section");
  element.innerHTML = '<label for="amount">Amount</label><input id="amount" name="amount">';
  document.body.append(element);
  vi.spyOn(element, "getBoundingClientRect").mockReturnValue(new DOMRect(10, 20, 300, 120));
  return element;
}

it("releases the live overlay while retaining an inert visual copy until the exit finishes", async () => {
  const element = panel();
  const copy = animateOverlayExit(element);
  element.remove();
  expect(copy?.inert).toBe(true);
  expect(copy?.getAttribute("aria-hidden")).toBe("true");
  expect(copy?.querySelector("[id], [name]")).toBeNull();
  expect(animate).toHaveBeenCalledTimes(2);
  finish();
  await Promise.resolve();
  expect(copy?.isConnected).toBe(false);
});

it("uses immediate positioning and creates no overlay copy with reduced motion", () => {
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: false })));
  const element = panel();
  expect(animateOverlayExit(element)).toBeUndefined();
  const messages = document.createElement("div");
  messages.scrollTo = vi.fn();
  scrollConversationToEnd(messages);
  expect(messages.scrollTo).toHaveBeenCalledWith({ top: messages.scrollHeight, behavior: "instant" });
  expect(animate).not.toHaveBeenCalled();
});

it("clears the pending button marker after a rejected action", async () => {
  const button = document.createElement("button");
  await expect(withButtonMotion(button, async () => {
    expect(button.dataset.motionBusy).toBe("true");
    throw new Error("network");
  })).rejects.toThrow("network");
  expect(button.dataset.motionBusy).toBeUndefined();
});
