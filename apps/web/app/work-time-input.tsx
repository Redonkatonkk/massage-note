"use client";

import { useEffect, useId, useState } from "react";
import { formatWorkTime, parseWorkTime } from "../lib/time";

interface WorkTimeInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onValidityChange: (valid: boolean) => void;
  optional?: boolean;
}

export function WorkTimeInput({ id, value, onChange, onValidityChange, optional = false }: WorkTimeInputProps) {
  const helpId = useId();
  const [draft, setDraft] = useState<{ value: string; text: string } | null>(null);
  const text = draft?.value === value ? draft.text : formatWorkTime(value);
  const parsed = parseWorkTime(text);
  const valid = parsed !== null || (optional && text.trim() === "");
  useEffect(() => onValidityChange(valid), [valid, onValidityChange]);
  return <span className="work-time-field">
    <input id={id} type="text" aria-label="时间 / Time" autoComplete="off"
      placeholder="1:30 PM" value={text} aria-invalid={!valid} aria-describedby={helpId}
      onChange={(event) => {
        const nextText = event.target.value;
        const next = parseWorkTime(nextText);
        const empty = optional && nextText.trim() === "";
        onValidityChange(next !== null || empty);
        const nextValue = next ?? (empty ? "" : value);
        setDraft({ value: nextValue, text: nextText });
        if (next !== null || empty) onChange(nextValue);
      }}
      onBlur={() => { if (valid) setDraft(null); }} />
    <small id={helpId} className={valid ? "field-help" : "form-error"}>
      {valid ? (parsed ? formatWorkTime(parsed) + " · " : "") + "9–11 → AM；12、1–8 → PM。可填写 AM/PM。" : "请填写 1–12 点，例如 1:30 PM / Enter a time, e.g. 1:30 PM"}
    </small>
  </span>;
}

export function WorkDateTimeInput({ value, fallbackDate, onChange, onValidityChange, optional = false }: WorkTimeInputProps & { fallbackDate: string }) {
  const [emptyDate, setEmptyDate] = useState<string | null>(null);
  const date = value ? value.slice(0, 10) : emptyDate ?? fallbackDate;
  const time = value ? value.slice(11) : "";
  return <span className="work-date-time-field">
    <input type="date" aria-label="日期 / Date" value={date} onChange={(event) => {
      if (!event.target.value) return;
      setEmptyDate(event.target.value);
      onChange(event.target.value && time ? `${event.target.value}T${time}` : "");
    }} />
    <WorkTimeInput value={time} optional={optional} onValidityChange={onValidityChange}
      onChange={(next) => onChange(next ? `${date}T${next}` : "")} />
  </span>;
}
