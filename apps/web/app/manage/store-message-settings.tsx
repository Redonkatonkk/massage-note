import { useEffect, useRef, useState } from "react";
import { dispatchSmsSettingsSchema, type DispatchSmsSettings } from "@massage-note/contracts";
import { apiRequest } from "../../lib/api";
import type { ClosingDeliveryStatus } from "../../lib/types";
import { useLanguage } from "../language-provider";
import { StoreSettingRule } from "./store-setting-rule";

const defaultSettings: DispatchSmsSettings = { enabled: false, sendTimeLocal: "21:00", phoneE164: null };
const formatPhone = (phone: string | null) => phone?.trim() || null;

export function dispatchSmsDraft(value: DispatchSmsSettings | null | undefined) {
  return value ?? defaultSettings;
}

export function dispatchSmsPayload(value: DispatchSmsSettings, saved: DispatchSmsSettings) {
  const result = dispatchSmsSettingsSchema.safeParse({ ...value, phoneE164: formatPhone(value.phoneE164) });
  if (result.success) return result.data;
  if (!value.enabled) return { ...saved, enabled: false };
  throw new Error(result.error.issues[0]?.message ?? "排工短信设置无效");
}

interface DispatchSmsResult {
  targetDate: string;
  status: ClosingDeliveryStatus;
  sentAt: string | null;
  deliveryStatus: string | null;
  lastErrorCode: string | null;
}

const dispatchResultNotes: Record<string, string> = {
  RANKING_NOT_READY: "请在明日看板核对排工设置并生成顺序。",
  EXPIRED: "已超过店铺当地午夜。",
  SETTINGS_CHANGED: "发送设置已变更。",
  TEXT_TOO_LONG: "排工名单超出短信长度限制。",
  MESSAGES_RESULT_AMBIGUOUS: "请在接收手机上核对。",
  MESSAGES_DELIVERY_FAILED: "请在接收手机上核对。",
};

function dispatchResultLabel(result: DispatchSmsResult) {
  if (result.status === "CANCELLED") return "已跳过";
  if (result.deliveryStatus === "DELIVERED") return "已送达";
  if (result.deliveryStatus === "SENT") return "已发出·未确认送达";
  if (result.deliveryStatus === "FAILED" || result.lastErrorCode === "MESSAGES_RESULT_AMBIGUOUS") return "送达待核对";
  if (result.status === "SENT") return "已提交·未确认送达";
  if (result.status === "FAILED") return "发送失败";
  return "排队发送";
}

export function DispatchSmsRule({ storeId, timezone, value, disabled, savedEnabled, onChange }: {
  storeId: string;
  timezone: string;
  value: DispatchSmsSettings;
  disabled: boolean;
  savedEnabled: boolean;
  onChange: (next: DispatchSmsSettings) => void;
}) {
  const [result, setResult] = useState<DispatchSmsResult | null | undefined>();
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!savedEnabled) return;
    let active = true;
    const refresh = async () => {
      try {
        const latest = await apiRequest<DispatchSmsResult | null>(`/stores/${storeId}/dispatch-sms/status`);
        if (active) { setResult(latest); setError(false); }
      } catch {
        if (active) setError(true);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [savedEnabled, storeId]);
  const note = result?.lastErrorCode ? dispatchResultNotes[result.lastErrorCode] : undefined;
  return <StoreSettingRule title="自动发送明日排工" description="按店铺时区发送明日的员工顺序。" enabled={value.enabled}
    disabled={disabled} onChange={enabled => onChange({ ...value, enabled })}>
    {value.enabled && <>
      <div className="manage-form-grid store-setting-fields">
        <label>接收号码<input name="dispatchSmsPhone" type="tel" autoComplete="off" pattern="\+[1-9][0-9]{7,14}"
          disabled={disabled} required value={value.phoneE164 ?? ""} placeholder="+16465550123"
          aria-describedby="dispatch-sms-phone-help"
          onChange={event => onChange({ ...value, phoneE164: event.target.value })} />
          <small id="dispatch-sms-phone-help">包含 + 和国际区号。</small>
        </label>
        <label>每日发送时间<input type="time" name="dispatchSmsTime" disabled={disabled} required value={value.sendTimeLocal}
          onChange={event => onChange({ ...value, sendTimeLocal: event.target.value })} />
          <small translate="no">{timezone}</small>
        </label>
      </div>
      <p className="field-help store-setting-example">
        <span>短信示例</span>
        <span translate="no">YYYY-MM-DD排工顺序<br />第一：Alex</span>
      </p>
      {savedEnabled && <div className="store-setting-result" role="status">
        {error ? <p>暂时无法读取排工短信状态。</p> : result === undefined ? <p>正在读取发送状态…</p> : result === null ? <p>还没有发送记录。</p> :
          <><p><span>最近处理</span> <time dateTime={result.targetDate}>{result.targetDate}</time> <strong>{dispatchResultLabel(result)}</strong></p>
            {note && <p className="field-help">{note}</p>}</>}
      </div>}
    </>}
  </StoreSettingRule>;
}

interface AgentStatus {
  tokenPrefix: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  lastStatusJson?: {
    messagesAvailable?: boolean;
    dispatchSmsSupported?: boolean;
    serviceTypes?: string[];
    lastError?: string | null;
  } | null;
}

export function MacMessagesDevice({ storeId, timezone, busy, run }: {
  storeId: string;
  timezone: string;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
}) {
  const { locale } = useLanguage();
  const [agent, setAgent] = useState<AgentStatus | null | undefined>();
  const [error, setError] = useState(false);
  const [token, setToken] = useState("");
  const requests = useRef(0);
  const path = `/stores/${storeId}/closing-delivery-agent`;
  useEffect(() => {
    const refresh = async () => {
      const id = ++requests.current;
      try {
        const status = await apiRequest<AgentStatus | null>(`${path}/status`);
        if (id === requests.current) { setAgent(status); setError(false); }
      } catch {
        if (id === requests.current) setError(true);
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => { ++requests.current; window.clearInterval(timer); };
  }, [path]);

  const online = !!agent?.lastSeenAt && Date.now() - Date.parse(agent.lastSeenAt) < 180_000;
  const ready = online && !agent?.revokedAt && agent?.lastStatusJson?.messagesAvailable && agent.lastStatusJson.dispatchSmsSupported;
  const status = error ? "状态暂不可用"
    : agent === undefined ? "正在读取…"
    : agent?.revokedAt ? "已撤销"
    : !agent?.lastSeenAt ? "未连接"
    : !online ? "离线"
    : !agent.lastStatusJson?.dispatchSmsSupported ? "需升级代理"
    : ready ? "可发送"
    : "信息 App 不可用";
  const lastSeen = agent?.lastSeenAt ? new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: timezone }).format(new Date(agent.lastSeenAt)) : null;
  return <section className="manage-card store-device">
    <div className="manage-heading"><h2>Mac 信息发送设备</h2><span className={`status-chip ${ready ? "" : "warning"}`} role="status">{status}</span></div>
    <p className="field-help">同一台 Mac 发送员工小结和排工短信。代理令牌只显示一次。</p>
    {lastSeen && <p className="field-help"><span>最后在线</span> <time dateTime={agent?.lastSeenAt ?? undefined}>{lastSeen}</time>{agent?.lastStatusJson?.serviceTypes?.length ? <> · {agent.lastStatusJson.serviceTypes.join(" / ")}</> : null}</p>}
    {agent?.lastStatusJson?.lastError && <p className="field-help store-device__error">{agent.lastStatusJson.lastError}</p>}
    {token && <label>新代理令牌（请立即复制）<input readOnly value={token} onFocus={event => event.currentTarget.select()} /></label>}
    <div className="inline-controls">
      <button className="secondary-action compact" type="button" disabled={busy || agent === undefined} onClick={() => void run(async () => {
        const result = await apiRequest<{ token: string; tokenPrefix: string }>(`${path}/credential`, { method: "POST" });
        ++requests.current;
        setError(false);
        setToken(result.token);
        setAgent({ tokenPrefix: result.tokenPrefix, lastSeenAt: null, revokedAt: null });
      })}>{agent ? "轮换代理令牌" : "生成代理令牌"}</button>
      {agent && !agent.revokedAt && <button className="secondary-action compact" type="button" disabled={busy} onClick={() => void run(async () => {
        await apiRequest(`${path}/credential`, { method: "DELETE" });
        ++requests.current;
        setAgent(current => current ? { ...current, revokedAt: new Date().toISOString() } : current);
        setToken("");
      })}>撤销代理</button>}
    </div>
  </section>;
}
