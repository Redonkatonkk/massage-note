"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest, errorMessage } from "../lib/api";
import type { AiMessageResponse, AiPreview } from "../lib/types";
import { useLanguage } from "./language-provider";

type AssistantType = "work" | "finance";
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  preview?: AiPreview | null | undefined;
  providerConfigured?: boolean;
};

const operationText = {
  CREATE_WORK_RECORD: "新增记工",
  UPDATE_WORK_RECORD: "修改记工",
  DELETE_WORK_RECORD: "删除记工",
} as const;

const content = {
  work: {
    title: "记工 AI 助手",
    welcome: "告诉我想新增、修改或删除哪条记工。我会先展示预览，只有你确认后才写入。",
    placeholder: "说出员工、项目、时间和金额…",
    examples: ["给 Amy 记一单 60分", "修改今天 3 点那单备注", "删除一条重复记工"],
  },
  finance: {
    title: "财务 AI 助手",
    welcome: "可以问我今天、本月或最近几天的大费、小费、员工收入、现金结算和老板尚欠。",
    placeholder: "询问日期、员工和金额口径…",
    examples: ["今天全店大费和小费是多少？", "最近 7 天刷卡小费", "本月老板尚欠多少？"],
  },
} as const;

function previewValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function previewTime(value: unknown): string {
  if (typeof value !== "string") return previewValue(value);
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function PreviewCard({
  preview,
  busy,
  confirm,
  cancel,
}: {
  preview: AiPreview;
  busy: boolean;
  confirm: (id: string) => Promise<void>;
  cancel: (id: string) => Promise<void>;
}) {
  const after = preview.after;
  const rows = [
    ["员工", after.employee ?? preview.target.employeeDisplayName],
    ["项目", after.service ?? (preview.target.serviceSnapshot as { name?: string } | undefined)?.name],
    ["开始时间", previewTime(after.startAt ?? preview.target.startAt)],
    ["结束时间", previewTime(after.endAt ?? preview.target.endAt)],
    ["项目金额", typeof after.amountCents === "number" ? `$${(after.amountCents / 100).toFixed(2)}` : undefined],
    ["额外项目", after.addons],
    ["折扣", after.discounts],
    ["付款", after.payment],
    ["备注", after.note],
    ["删除原因", after.reason],
  ].filter((row) => row[1] !== undefined);
  return (
    <section className={`ai-preview ${preview.operation === "DELETE_WORK_RECORD" ? "delete" : ""}`}>
      <header><div><strong>{operationText[preview.operation]}</strong><span>预览将在 {new Date(preview.expiresAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 过期</span></div><em>尚未写入</em></header>
      <dl>{rows.map(([label, value]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{previewValue(value)}</dd></div>)}</dl>
      {preview.warnings.length > 0 && <div className="preview-warnings">{preview.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>}
      <div className="preview-actions"><button className={preview.operation === "DELETE_WORK_RECORD" ? "danger-button" : "primary-action"} type="button" disabled={busy} onClick={() => void confirm(preview.previewId)}>确认执行</button><button className="secondary-action" type="button" disabled={busy} onClick={() => void cancel(preview.previewId)}>放弃</button></div>
    </section>
  );
}

export function FloatingAiAssistant({
  storeId,
  type,
  onWorkChanged,
}: {
  storeId: string;
  type: AssistantType;
  onWorkChanged?: (() => Promise<void>) | undefined;
}) {
  const { locale, t } = useLanguage();
  const settings = content[type];
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: `welcome-${type}`, role: "assistant", text: settings.welcome },
  ]);
  const [conversationId, setConversationId] = useState("");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput(""); setBusy(true); setError("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text }]);
    try {
      const response = await apiRequest<AiMessageResponse>(`/stores/${storeId}/ai/${type}/messages`, {
        method: "POST",
        body: { text, locale, ...(conversationId ? { conversationId } : {}) },
      });
      setConversationId(response.conversationId);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: response.answer, preview: response.preview, providerConfigured: response.providerConfigured }]);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(previewId: string) {
    setBusy(true); setError("");
    try {
      await apiRequest(`/stores/${storeId}/ai/previews/${previewId}/confirm`, { method: "POST", body: { confirm: true } });
      setMessages((current) => current.map((message) => message.preview?.previewId === previewId ? { ...message, text: `${message.text}\n已确认并写入。`, preview: null } : message));
      await onWorkChanged?.();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(previewId: string) {
    setBusy(true); setError("");
    try {
      await apiRequest(`/stores/${storeId}/ai/previews/${previewId}`, { method: "DELETE" });
      setMessages((current) => current.map((message) => message.preview?.previewId === previewId ? { ...message, text: `${message.text}\n已放弃，没有修改数据。`, preview: null } : message));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="floating-ai-root">
      {open && <section id={`floating-ai-${type}`} className="floating-ai-dialog" role="dialog" aria-label={settings.title}>
        <header className="floating-ai-heading"><div><span aria-hidden="true">AI</span><div><strong>{settings.title}</strong><small>{type === "work" ? "确认后才会修改记工" : "财务数据只读"}</small></div></div><button type="button" aria-label="关闭 AI 助手" onClick={() => setOpen(false)}>×</button></header>
        <div className="floating-ai-examples">{settings.examples.map((example) => <button key={example} type="button" onClick={() => setInput(t(example))}>{example}</button>)}</div>
        <div className="chat-messages floating-ai-messages">{messages.map((message) => <article key={message.id} className={`chat-message ${message.role}`}><span>{message.role === "user" ? "你" : "助"}</span><div><p>{message.text}</p>{message.role === "assistant" && message.providerConfigured === false && <small>当前使用安全降级模式。</small>}{message.preview && <PreviewCard preview={message.preview} busy={busy} confirm={confirm} cancel={cancel} />}</div></article>)}{busy && <article className="chat-message assistant"><span>助</span><div><p>正在核对权限和数据…</p></div></article>}<div ref={endRef} /></div>
        {error && <p className="form-error floating-ai-error" role="alert">{error}</p>}
        <form className="chat-composer floating-ai-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}><textarea aria-label={`给${settings.title}的消息`} maxLength={4000} rows={2} placeholder={settings.placeholder} value={input} onChange={(event) => setInput(event.target.value)} /><div><span>{input.length}/4000</span><button className="primary-action" type="submit" disabled={busy || !input.trim()}>{busy ? "处理中…" : "发送"}</button></div></form>
      </section>}
      <button className="floating-ai-button" type="button" aria-controls={`floating-ai-${type}`} aria-expanded={open} aria-label={open ? `收起${settings.title}` : `打开${settings.title}`} onClick={() => setOpen((value) => !value)}><span>AI</span><strong>{type === "work" ? "记工助手" : "财务助手"}</strong></button>
    </div>
  );
}
