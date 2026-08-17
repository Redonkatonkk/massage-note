"use client";

import { useEffect, useRef, useState } from "react";
import { apiRequest, errorMessage } from "../../lib/api";
import { useStoreRealtime } from "../../lib/realtime";
import type { AiMessageResponse, AiPreview, MeResponse, MembershipSummary } from "../../lib/types";
import { useLanguage } from "../language-provider";
import { useAiVoiceInput } from "../use-ai-voice-input";

type AssistantType = "work" | "finance";
type ChatMessage = { id: string; role: "user" | "assistant"; text: string; preview?: AiPreview | null; providerConfigured?: boolean };

const operationText = { CREATE_WORK_RECORD: "新增记工", UPDATE_WORK_RECORD: "修改记工", DELETE_WORK_RECORD: "删除记工" } as const;

function previewValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function previewTime(value: unknown): string {
  if (typeof value !== "string") return previewValue(value);
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function previewPayment(value: unknown): string {
  if (!value || typeof value !== "object") return previewValue(value);
  const payment = value as Record<string, unknown>;
  const cents = (key: string) => typeof payment[key] === "number" ? payment[key] as number : 0;
  const result: string[] = [];
  const groups = [
    [["cashServiceCents", "现金大费"], ["cardServiceCents", "刷卡大费"]],
    [["cashTipCents", "现金小费"], ["cardTipCents", "刷卡小费"]],
  ] as const;
  for (const [index, group] of groups.entries()) {
    const nonzero = group.filter(([key]) => cents(key) !== 0);
    if (nonzero.length === 0) result.push(`${index === 0 ? "大费" : "小费"} $0.00`);
    else for (const [key, label] of nonzero) result.push(`${label} $${(cents(key) / 100).toFixed(2)}`);
  }
  return result.join("、");
}

function previewItems(value: unknown): string {
  if (!Array.isArray(value)) return previewValue(value);
  if (value.length === 0) return "无";
  return value.map((entry) => {
    if (!entry || typeof entry !== "object") return previewValue(entry);
    const item = entry as Record<string, unknown>;
    const amount = typeof item.amountCents === "number" ? ` $${(item.amountCents / 100).toFixed(2)}` : "";
    return `${String(item.name ?? item.shortName ?? "项目")}${amount}`;
  }).join("、");
}

export function AssistantPageClient() {
  const { locale, t } = useLanguage();
  const [membership, setMembership] = useState<MembershipSummary | null>(null);
  const [type, setType] = useState<AssistantType>("work");
  const [messages, setMessages] = useState<Record<AssistantType, ChatMessage[]>>({ work: [{ id: "welcome-work", role: "assistant", text: "告诉我想新增、修改或删除哪条记工。我会先展示完整预览，只有你确认后才写入。" }], finance: [{ id: "welcome-finance", role: "assistant", text: "可以问我今天、本月或最近几天的大费、小费、员工收入、现金结算和老板尚欠。所有数字都由后端财务引擎计算。" }] });
  const [conversationIds, setConversationIds] = useState<Partial<Record<AssistantType, string>>>({});
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const realtimeState = useStoreRealtime(membership?.store.id, () => undefined);
  const voice = useAiVoiceInput({
    storeId: membership?.store.id,
    locale,
    enabled: type === "work",
    onText: setInput,
    onError: setError,
  });
  const inputBusy = busy || voice.transcribing;

  useEffect(() => {
    void apiRequest<MeResponse>("/me").then((profile) => {
      const requestedStore = new URL(window.location.href).searchParams.get("store");
      const selected = profile.memberships.find((item) => item.store.id === requestedStore) ?? profile.memberships.find((item) => item.store.id === window.localStorage.getItem("massage_note_store_id")) ?? profile.memberships[0];
      if (!selected) window.location.replace("/"); else setMembership(selected);
    }).catch((caught) => { if ((caught as { status?: number }).status === 401) window.location.replace("/login"); else setError(errorMessage(caught)); });
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, type]);

  async function send() {
    if (!membership || !input.trim() || inputBusy || voice.recording) return;
    const text = input.trim();
    setInput(""); setBusy(true); setError("");
    setMessages((current) => ({ ...current, [type]: [...current[type], { id: crypto.randomUUID(), role: "user", text }] }));
    try {
      const response = await apiRequest<AiMessageResponse>(`/stores/${membership.store.id}/ai/${type}/messages`, { method: "POST", body: { text, locale, ...(conversationIds[type] ? { conversationId: conversationIds[type] } : {}) } });
      setConversationIds((current) => ({ ...current, [type]: response.conversationId }));
      setMessages((current) => ({ ...current, [type]: [...current[type], { id: crypto.randomUUID(), role: "assistant", text: response.answer, preview: response.preview, providerConfigured: response.providerConfigured }] }));
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(false); }
  }

  async function confirm(previewId: string) {
    if (!membership) return;
    setBusy(true); setError("");
    try {
      await apiRequest(`/stores/${membership.store.id}/ai/previews/${previewId}/confirm`, { method: "POST", body: { confirm: true } });
      setMessages((current) => ({ ...current, work: current.work.map((message) => message.preview?.previewId === previewId ? { ...message, text: `${message.text}\n已确认并写入，今日记工表会自动同步。`, preview: null } : message) }));
    } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(false); }
  }

  async function cancel(previewId: string) {
    if (!membership) return;
    setBusy(true); setError("");
    try {
      await apiRequest(`/stores/${membership.store.id}/ai/previews/${previewId}`, { method: "DELETE" });
      setMessages((current) => ({ ...current, work: current.work.map((message) => message.preview?.previewId === previewId ? { ...message, text: `${message.text}\n已放弃，没有修改任何记工。`, preview: null } : message) }));
    } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(false); }
  }

  if (!membership) return <main className="center-page"><div className="loading-card"><span className="spinner" /><strong>{error || "正在打开 AI 助手…"}</strong></div></main>;
  const examples = (type === "work" ? ["给我记 60分，现金大费100，刷卡小费20", "把 Amy 今天 3 点那单备注改成老客", "删除 Amy 今天的 60分，原因是重复录入"] : ["今天全店大费和小费是多少？", "最近 7 天 Amy 的刷卡小费", "今天还有谁的现金没有结清？", "本月老板尚欠员工多少钱？"]).map(t);
  return <main className="app-shell assistant-shell"><header className="topbar"><div><p className="eyebrow">{membership.store.name}</p><h1>AI 助手</h1><p className="business-date">先预览再执行 · 财务只读 <span className={`sync-status ${realtimeState === "网络已断开" ? "offline" : ""}`}>{realtimeState}</span></p></div><a className="store-switcher header-link" href="/">返回今日记工</a></header><nav className="section-tabs" aria-label="AI 助手类型"><button className={type === "work" ? "active" : ""} type="button" onClick={() => setType("work")}>记工助手</button><button className={type === "finance" ? "active" : ""} type="button" onClick={() => setType("finance")}>财务助手</button></nav><section className="assistant-layout"><aside className="assistant-examples"><h2>可以这样说</h2>{examples.map((example) => <button key={example} type="button" onClick={() => setInput(example)}>{example}</button>)}<p>{type === "work" ? "AI 无权跳过预览；删除必须明确原因并二次确认。" : "AI 不自行计算，也不能修改日结、现金或工资结算。"}</p></aside><section className="chat-panel" aria-label={type === "work" ? "记工助手对话" : "财务助手对话"}><div className="chat-messages">{messages[type].map((message) => <article key={message.id} className={`chat-message ${message.role}`}><span>{message.role === "user" ? "你" : "助"}</span><div><p>{message.text}</p>{message.role === "assistant" && message.providerConfigured === false && <small>当前使用安全降级模式；配置 MiniMax 后可理解更复杂的表达。</small>}{message.preview && <PreviewCard preview={message.preview} busy={busy} confirm={confirm} cancel={cancel} />}</div></article>)}{busy && <article className="chat-message assistant"><span>助</span><div><p>正在核对权限和数据…</p></div></article>}<div ref={endRef} /></div>{error && <p className="form-error" role="alert">{error}</p>}<form className="chat-composer" onSubmit={(event) => { event.preventDefault(); void send(); }}><textarea aria-label="给 AI 助手的消息" maxLength={4000} rows={3} placeholder={type === "work" ? "说出员工、项目、时间和金额…" : "询问日期、员工和金额口径…"} value={input} onChange={(event) => setInput(event.target.value)} /><div><span>{input.length}/4000</span><div className="composer-actions">{type === "work" && <button className={`voice-button ${voice.recording ? "recording" : ""}`} type="button" disabled={busy || voice.transcribing || voice.finishingRecording} onClick={voice.recording ? voice.stopRecording : () => void voice.startRecording()}>{voice.transcribing ? "正在转写…" : voice.finishingRecording ? "正在完成录音…" : voice.recording ? "停止并转写" : "语音输入"}</button>}<button className="primary-action" type="submit" disabled={inputBusy || voice.recording || !input.trim()}>{inputBusy ? "处理中…" : "发送"}</button></div></div></form></section></section></main>;
}

function PreviewCard({ preview, busy, confirm, cancel }: { preview: AiPreview; busy: boolean; confirm: (id: string) => Promise<void>; cancel: (id: string) => Promise<void> }) {
  const after = preview.after;
  const rows = [
    ["员工", after.employee ?? preview.target.employeeDisplayName ?? (preview.target.employee as { displayName?: string } | undefined)?.displayName],
    ["项目", after.service ?? (preview.target.serviceSnapshot as { name?: string } | undefined)?.name],
    ["开始时间", previewTime(after.startAt ?? preview.target.startAt)],
    ["结束时间", previewTime(after.endAt ?? preview.target.endAt)],
    ["项目金额", typeof after.amountCents === "number" ? `$${(after.amountCents / 100).toFixed(2)}` : undefined],
    ["额外项目", after.addons === undefined ? undefined : previewItems(after.addons)],
    ["折扣", after.discounts === undefined ? undefined : previewItems(after.discounts)],
    ["付款", after.payment === undefined ? undefined : previewPayment(after.payment)],
    ["备注", after.note],
    ["删除原因", after.reason],
  ].filter((row) => row[1] !== undefined);
  return <section className={`ai-preview ${preview.operation === "DELETE_WORK_RECORD" ? "delete" : ""}`}><header><div><strong>{operationText[preview.operation]}</strong><span>预览将在 {new Date(preview.expiresAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 过期</span></div><em>尚未写入</em></header><dl>{rows.map(([label, value]) => <div key={String(label)}><dt>{String(label)}</dt><dd>{previewValue(value)}</dd></div>)}</dl>{preview.warnings.length > 0 && <div className="preview-warnings">{preview.warnings.map((warning) => <span key={warning}>{warning}</span>)}</div>}<div className="preview-actions"><button className={preview.operation === "DELETE_WORK_RECORD" ? "danger-button" : "primary-action"} type="button" disabled={busy} onClick={() => void confirm(preview.previewId)}>确认执行</button><button className="secondary-action" type="button" disabled={busy} onClick={() => void cancel(preview.previewId)}>放弃</button></div></section>;
}
