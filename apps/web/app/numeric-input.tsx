"use client";

import { useEffect, useRef, type ComponentPropsWithoutRef } from "react";
import { useLanguage } from "./language-provider";

type NumericInputProps = Omit<ComponentPropsWithoutRef<"input">, "type" | "inputMode" | "value" | "defaultValue"> & {
  value: string;
  inputMode?: "numeric" | "decimal";
  allowPercent?: boolean;
};

export function NumericInput({ value, inputMode = "numeric", allowPercent = false, onChange, onKeyDown, onPaste, onCompositionEnd, min, max, pattern, ...props }: NumericInputProps) {
  const input = useRef<HTMLInputElement>(null);
  const { locale } = useLanguage();
  const accepts = (text: string) => text === "" || (inputMode === "decimal" ? /^[0-9]+(?:\.[0-9]{0,2})?$/ : /^[0-9]+$/).test(allowPercent ? text.replace(/%$/, "") : text);

  useEffect(() => {
    const number = Number(allowPercent ? value.replace(/%$/, "") : value);
    const below = value !== "" && min !== undefined && number < Number(min);
    const above = value !== "" && max !== undefined && number > Number(max);
    input.current?.setCustomValidity(below || above
      ? locale === "en-US" ? `Enter a value ${below ? `at least ${min}` : `no greater than ${max}`}.`
        : `请输入${below ? `不小于 ${min}` : `不大于 ${max}`}的数值。`
      : "");
  }, [value, min, max, locale, allowPercent]);

  return <input {...props} ref={input} type="text" inputMode={allowPercent ? "text" : inputMode} min={min} max={max}
    pattern={pattern ?? `${inputMode === "decimal" ? "[0-9]+(\\.[0-9]{0,2})?" : "[0-9]+"}${allowPercent ? "%?" : ""}`} value={value}
    onKeyDown={event => {
      onKeyDown?.(event);
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1 &&
        !(inputMode === "decimal" ? /[0-9.]/ : /[0-9]/).test(event.key) && !(allowPercent && event.key === "%")) event.preventDefault();
    }}
    onPaste={event => {
      onPaste?.(event);
      const field = event.currentTarget;
      const next = field.value.slice(0, field.selectionStart ?? field.value.length) + event.clipboardData.getData("text") + field.value.slice(field.selectionEnd ?? field.value.length);
      if (!accepts(next)) event.preventDefault();
    }}
    onCompositionEnd={event => {
      if (!accepts(event.currentTarget.value)) event.currentTarget.value = value;
      onCompositionEnd?.(event);
    }}
    onChange={event => {
      if (accepts(event.currentTarget.value)) onChange?.(event);
      else event.currentTarget.value = value;
    }} />;
}
