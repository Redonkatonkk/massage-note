"use client";

import { useEffect, useState } from "react";
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
  const valid = /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value) || (optional && value === "");
  const [hour24, minute = "00"] = value ? value.split(":") : ["0", "00"];
  const hour = String(Number(hour24) % 12 || 12);
  const period = Number(hour24) >= 12 ? "PM" : "AM";
  useEffect(() => onValidityChange(valid), [valid, onValidityChange]);

  function update(nextHour: string, nextMinute: string, nextPeriod: string) {
    if (!nextHour) {
      onChange("");
      return;
    }
    const nextHour24 = Number(nextHour) % 12 + (nextPeriod === "PM" ? 12 : 0);
    onChange(`${String(nextHour24).padStart(2, "0")}:${nextMinute}`);
  }

  return <span className="work-time-field">
    <select id={id} aria-label={english ? "Hour" : "小时"} value={value ? hour : ""}
      aria-invalid={!valid} onChange={(event) => update(event.target.value, minute, period)}>
      <option value="" disabled={!optional}>{english ? "Hour" : "小时"}</option>
      {Array.from({ length: 12 }, (_, index) => index + 1).map((item) =>
        <option key={item} value={String(item)}>{item}</option>)}
    </select>
    <select aria-label={english ? "Minute" : "分钟"} value={value ? minute : ""}
      onChange={(event) => update(hour, event.target.value, period)}>
      <option value="" disabled>{english ? "Minute" : "分钟"}</option>
      {Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0")).map((item) =>
        <option key={item} value={item}>{item}</option>)}
    </select>
    <select aria-label={english ? "AM/PM" : "上午/下午"} value={value ? period : ""}
      onChange={(event) => update(hour, minute, event.target.value)}>
      <option value="" disabled>{english ? "AM/PM" : "时段"}</option>
      <option value="AM">{english ? "AM" : "上午"}</option>
      <option value="PM">{english ? "PM" : "下午"}</option>
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
