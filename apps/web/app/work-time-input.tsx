"use client";

import { useEffect, useState } from "react";
import { parseWorkTimeParts } from "../lib/time";
import { useLanguage } from "./language-provider";

interface WorkTimeInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onValidityChange: (valid: boolean) => void;
  optional?: boolean;
}

export function WorkTimeInput({ id, value, onChange, onValidityChange, optional = false }: WorkTimeInputProps) {
  const { locale } = useLanguage();
  const english = locale === "en-US";
  const [draft, setDraft] = useState<{ value: string; hour: string; minute: string; period: string } | null>(null);
  const [hour24, minute24 = "00"] = value.split(":");
  const fields = draft?.value === value ? draft : {
    hour: value ? String(Number(hour24) % 12 || 12) : "",
    minute: value ? minute24 : "",
    period: value ? (Number(hour24) >= 12 ? "PM" : "AM") : "",
  };
  const parsed = parseWorkTimeParts(fields.hour, fields.minute, fields.period);
  const valid = parsed !== null || (optional && fields.hour.trim() === "");
  useEffect(() => onValidityChange(valid), [valid, onValidityChange]);

  function update(field: "hour" | "minute" | "period", text: string) {
    const next = { ...fields, [field]: text };
    const parsedNext = parseWorkTimeParts(next.hour, next.minute, next.period);
    const empty = optional && next.hour.trim() === "";
    const nextValue = parsedNext ?? (empty ? "" : value);
    setDraft({ ...next, value: nextValue });
    onValidityChange(parsedNext !== null || empty);
    if (parsedNext !== null || empty) onChange(nextValue);
  }

  return <span className="work-time-field">
    <input id={id} type="text" inputMode="numeric" autoComplete="off" maxLength={2}
      aria-label={english ? "Hour" : "小时"} placeholder={english ? "Hour" : "小时"}
      value={fields.hour} aria-invalid={!valid} onChange={(event) => update("hour", event.target.value)} />
    <input type="text" inputMode="numeric" autoComplete="off" maxLength={2}
      aria-label={english ? "Minute" : "分钟"} placeholder={english ? "Minute" : "分钟"}
      value={fields.minute} aria-invalid={!valid} onChange={(event) => update("minute", event.target.value)} />
    <select aria-label="AM/PM" value={fields.period} aria-invalid={!valid}
      onChange={(event) => update("period", event.target.value)}>
      <option value="" disabled>AM/PM</option>
      <option value="AM">AM</option>
      <option value="PM">PM</option>
    </select>
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
