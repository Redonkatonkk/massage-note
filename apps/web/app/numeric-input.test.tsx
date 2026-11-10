// @vitest-environment jsdom
import { act, useState, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NumericInput } from "./numeric-input";
import { WorkTimeInput } from "./work-time-input";

let root: Root, container: HTMLDivElement;
const changed = vi.fn();
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  changed.mockClear();
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

async function mount(props: Omit<ComponentProps<typeof NumericInput>, "value"> = {}, initial = "") {
  function Field() {
    const [value, setValue] = useState(initial);
    return <NumericInput {...props} value={value} onChange={event => { setValue(event.target.value); changed(event.target.value); }} />;
  }
  await act(async () => root.render(<Field />));
  return container.querySelector("input")!;
}
async function fill(field: HTMLInputElement, value: string, inputType = "insertText") {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType }));
  });
}
async function paste(field: HTMLInputElement, text: string) {
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { getData: () => text } });
  await act(async () => field.dispatchEvent(event));
  return event;
}

it("integer fields accept digits, leading zeroes, deletion and empty drafts", async () => {
  const field = await mount();
  for (const value of ["0", "001", "90", "9", ""]) {
    await fill(field, value);
    expect(field.value).toBe(value);
    expect(changed).toHaveBeenLastCalledWith(value);
  }
  expect(field.inputMode).toBe("numeric");
});

it("integer fields reject text, decimal points, signs, exponents and separators without altering the prior value", async () => {
  const field = await mount({}, "12");
  for (const value of ["中文", "１２", "12a", "12:30", "1.5", "-12", "+12", "1e2", "1E2", "1 2", "1\n2", "12%", "12$"]) {
    await fill(field, value);
    expect(field.value).toBe("12");
  }
  expect(changed).not.toHaveBeenCalled();
});

it("amounts accept a single decimal point and at most two fractional digits", async () => {
  const field = await mount({ inputMode: "decimal" });
  for (const value of ["0", "0.", "0.5", "0.50", "12.34", "12", ""]) {
    await fill(field, value);
    expect(field.value).toBe(value);
    expect(changed).toHaveBeenLastCalledWith(value);
  }
  expect(field.inputMode).toBe("decimal");
});

it("amounts reject excess precision and symbols without converting pasted money into a different amount", async () => {
  const field = await mount({ inputMode: "decimal" }, "12.50");
  for (const value of ["12.501", "12..50", "$12.50", "1,250", "-12", "+12", "1e2", "12%", "NaN", "Infinity", " 12.50 ", "十二元"]) {
    await fill(field, value);
    expect(field.value).toBe("12.50");
  }
  expect(changed).not.toHaveBeenCalled();
});

it("discount inputs opt into a single trailing percent sign and retain decimal precision", async () => {
  const field = await mount({ inputMode: "decimal", allowPercent: true });
  for (const value of ["10", "10%", "12.5%", "12.50%", "12.50", ""]) {
    await fill(field, value);
    expect(field.value).toBe(value);
    expect(changed).toHaveBeenLastCalledWith(value);
    expect(field.checkValidity()).toBe(true);
  }
  expect(field.inputMode).toBe("text");
  const percent = new KeyboardEvent("keydown", { key: "%", bubbles: true, cancelable: true });
  await act(async () => field.dispatchEvent(percent));
  expect(percent.defaultPrevented).toBe(false);
});

it("discount inputs reject misplaced/repeated percent signs, letters and excess precision in typing and paste", async () => {
  const field = await mount({ inputMode: "decimal", allowPercent: true }, "12.5%");
  for (const value of ["%", "%10", "10%%", "10%2", "10.123%", "-10%", "10percent", "$10", "中文"]) {
    await fill(field, value);
    expect(field.value).toBe("12.5%");
    field.setSelectionRange(0, field.value.length);
    expect((await paste(field, value)).defaultPrevented).toBe(true);
  }
  expect((await paste(field, "25.75%")).defaultPrevented).toBe(false);
  expect(changed).not.toHaveBeenCalled();
});

it("paste validation checks the result of replacing the selected text", async () => {
  const field = await mount({ inputMode: "decimal" }, "12.50");
  field.setSelectionRange(0, field.value.length);
  for (const value of ["$25.00", "25.001", "25%", "二十五"]) {
    expect((await paste(field, value)).defaultPrevented).toBe(true);
    expect(field.value).toBe("12.50");
  }
  expect((await paste(field, "25.00")).defaultPrevented).toBe(false);
  field.setSelectionRange(3, 5);
  expect((await paste(field, "75")).defaultPrevented).toBe(false);
  field.setSelectionRange(5, 5);
  expect((await paste(field, "1")).defaultPrevented).toBe(true);
  expect(changed).not.toHaveBeenCalled();
});

it("blocks symbol keys while preserving navigation, editing and system shortcuts", async () => {
  const field = await mount();
  for (const [key, blocked] of [["a", true], ["e", true], ["-", true], ["+", true], [".", true], ["5", false], ["Backspace", false], ["Delete", false], ["ArrowLeft", false], ["Tab", false], ["Enter", false]] as const) {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
    await act(async () => field.dispatchEvent(event));
    expect(event.defaultPrevented).toBe(blocked);
  }
  for (const key of ["a", "c", "v", "x", "z", "y"]) {
    for (const modifier of ["ctrlKey", "metaKey"]) {
      const event = new KeyboardEvent("keydown", { key, [modifier]: true, bubbles: true, cancelable: true });
      await act(async () => field.dispatchEvent(event));
      expect(event.defaultPrevented).toBe(false);
    }
  }
});

it("composition and dropped text cannot put illegal characters into the draft", async () => {
  const field = await mount({ inputMode: "decimal" }, "12.50");
  await act(async () => {
    field.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(field, "价格");
    field.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "价格" }));
  });
  expect(field.value).toBe("12.50");
  await fill(field, "$50", "insertFromDrop");
  expect(field.value).toBe("12.50");
  expect(changed).not.toHaveBeenCalled();
});

it("retains required and minimum/maximum validation for text-based numeric fields", async () => {
  const field = await mount({ required: true, min: 1, max: 720 });
  expect(field.checkValidity()).toBe(false);
  await fill(field, "0"); expect(field.validity.customError).toBe(true);
  await fill(field, "720"); expect(field.checkValidity()).toBe(true);
  await fill(field, "721"); expect(field.validity.customError).toBe(true);
  await fill(field, ""); expect(field.validity.customError).toBe(false);
});

it("work-time hour and minute fields preserve the last valid time when letters or symbols are entered", async () => {
  const valid = vi.fn();
  await act(async () => root.render(<WorkTimeInput value="10:30" onChange={changed} onValidityChange={valid} />));
  const [hour, minute] = container.querySelectorAll("input");
  await fill(hour!, "e"); await fill(minute!, "-1");
  expect([hour!.value, minute!.value]).toEqual(["10", "30"]);
  expect(changed).not.toHaveBeenCalled();
  expect(valid).toHaveBeenLastCalledWith(true);
  await fill(minute!, "45");
  expect(changed).toHaveBeenLastCalledWith("10:45");
});
