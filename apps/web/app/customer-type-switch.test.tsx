// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { WorkRecordCustomerType } from "../lib/types";
import { CustomerTypeSwitch } from "./customer-type-switch";
import { LanguageProvider } from "./language-provider";

let root: Root;
let container: HTMLDivElement;
let reduced = false;
let resize: () => void;
let visibleBounds: DOMRect | null = null;
const cancel = vi.fn();
const animate = vi.fn((_frames: Keyframe[], _timing: KeyframeAnimationOptions) => ({ cancel }));
function Harness({ disabled = false }: { disabled?: boolean }) {
  const [value, setValue] = useState<WorkRecordCustomerType | null>(null);
  return <CustomerTypeSwitch value={value} onChange={setValue} disabled={disabled} />;
}
function buttons() { return [...container.querySelectorAll<HTMLButtonElement>("button")]; }
async function choose(index: number) { await act(async () => buttons()[index]!.click()); }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  reduced = false; visibleBounds = null; animate.mockClear(); cancel.mockClear();
  const media = new EventTarget(); Object.defineProperty(media, "matches", { get: () => reduced });
  vi.stubGlobal("matchMedia", vi.fn(() => media));
  vi.stubGlobal("ResizeObserver", class { constructor(callback: () => void) { resize = callback; } observe() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains("customer-type-switch")) return new DOMRect(0, 0, 176, 52);
    if (this.matches(".customer-type-switch button")) return new DOMRect(4 + buttons().indexOf(this as HTMLButtonElement) * 84, 4, 84, 44);
    if (this.classList.contains("customer-type-switch__capsule")) return visibleBounds ?? new DOMRect(parseFloat(this.style.left) || 0, 4, parseFloat(this.style.width) || 0, 44);
    return new DOMRect();
  });
  Object.defineProperty(HTMLElement.prototype, "animate", { configurable: true, value: animate });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  delete (HTMLElement.prototype as Partial<HTMLElement>).animate;
  vi.restoreAllMocks(); vi.unstubAllGlobals(); localStorage.clear();
});
it("starts empty, selects exclusively, cancels on repeat, and supports keyboard navigation", async () => {
  await act(async () => root.render(<Harness />));
  expect(buttons().map(node => node.getAttribute("aria-pressed"))).toEqual(["false", "false"]);
  const capsule = container.querySelector<HTMLElement>(".customer-type-switch__capsule")!;
  expect(capsule.style.visibility).toBe("hidden");
  await choose(0); await choose(1);
  expect(buttons().map(node => node.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
  expect(animate).toHaveBeenCalledTimes(1);
  visibleBounds = new DOMRect(34, 4, 116, 44);
  await choose(0);
  expect(animate.mock.calls.at(-1)?.[0][0]).toMatchObject({ left: "34px", width: "116px" });
  for (const [key, selected] of [["End", 1], ["ArrowLeft", 0], ["Home", 0]] as const) {
    await act(async () => (buttons().find(node => node.getAttribute("aria-pressed") === "true") ?? buttons()[0])!.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
    expect(buttons()[selected]!.getAttribute("aria-pressed")).toBe("true");
    expect(document.activeElement).toBe(buttons()[selected]);
  }
  await choose(0);
  expect(capsule.style.visibility).toBe("hidden");
  expect(cancel).toHaveBeenCalled();
});
it("honors reduced motion, resize and disabled controls", async () => {
  reduced = true;
  await act(async () => root.render(<Harness />));
  await choose(0); await choose(1); await act(async () => resize());
  expect(animate).not.toHaveBeenCalled();
  expect(container.querySelector<HTMLElement>(".customer-type-switch__capsule")!.style.left).toBe("88px");
  await act(async () => root.render(<Harness disabled />));
  await choose(0);
  expect(buttons().every(node => node.disabled)).toBe(true);
  expect(buttons()[1]!.getAttribute("aria-pressed")).toBe("true");
});
it.each(["zh-CN", "en-US"] as const)("localizes controls and their accessible name: %s", async locale => {
  await act(async () => root.render(<LanguageProvider initialLocale={locale}><Harness /></LanguageProvider>));
  expect(buttons().map(node => node.textContent)).toEqual(locale === "en-US" ? ["New", "Returning"] : ["新客", "老客"]);
  expect(container.querySelector('[role="group"]')?.getAttribute("aria-label")).toBe(locale === "en-US" ? "Customer type (optional)" : "客人类型（选填）");
});
