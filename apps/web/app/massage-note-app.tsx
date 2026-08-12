"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, errorMessage } from "../lib/api";
import { deduplicateMembershipRows } from "../lib/board";
import type {
  BoardResponse,
  CatalogResponse,
  CurrentBusinessDay,
  MeResponse,
  MembershipSummary,
  StoreDetails,
  StoreMember,
} from "../lib/types";
import { TodayBoard } from "./today-board";
import { useStoreRealtime } from "../lib/realtime";
import { AppNav } from "./app-nav";
import { FloatingAiAssistant } from "./floating-ai-assistant";

function chineseDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

function deduplicateBoardRows(board: BoardResponse): BoardResponse {
  return {
    ...board,
    rows: deduplicateMembershipRows(board.rows),
  };
}

function LoadingPage({ message = "正在加载记工表…" }: { message?: string }) {
  return <main className="center-page"><div className="loading-card"><span className="spinner" aria-hidden="true" /><strong>{message}</strong></div></main>;
}

function ProfileSetup({ onDone }: { onDone: () => Promise<void> }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <main className="center-page">
      <form className="setup-card" onSubmit={(event) => {
        event.preventDefault();
        setBusy(true); setError("");
        apiRequest("/me/profile", { method: "PATCH", body: { firstName, lastName } })
          .then(onDone).catch((caught) => setError(errorMessage(caught))).finally(() => setBusy(false));
      }}>
        <p className="eyebrow">首次使用</p><h1>先填写你的姓名</h1>
        <p className="field-help">姓名用于创建店铺、加入申请和审计记录。店内显示名之后可单独修改。</p>
        <div className="editor-grid">
          <label className="field-label">名<input autoComplete="given-name" required maxLength={50} value={firstName} onChange={(event) => setFirstName(event.target.value)} /></label>
          <label className="field-label">姓<input autoComplete="family-name" required maxLength={50} value={lastName} onChange={(event) => setLastName(event.target.value)} /></label>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-action" type="submit" disabled={busy}>{busy ? "正在保存…" : "保存并继续"}</button>
      </form>
    </main>
  );
}

function StoreSetup({ me, onDone }: { me: MeResponse; onDone: () => Promise<void> }) {
  const [mode, setMode] = useState<"choose" | "create" | "join">("choose");
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York");
  const [cutoff, setCutoff] = useState("22:00");
  const [commission, setCommission] = useState("50");
  const [storeCode, setStoreCode] = useState("");
  const [resolvedStore, setResolvedStore] = useState<{ id: string; name: string; storeCode: string } | null>(null);
  const [displayName, setDisplayName] = useState(`${me.firstName ?? ""} ${me.lastName ?? ""}`.trim());
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function createStore() {
    const percent = Number(commission);
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error("全店默认提成必须在 0% 到 100% 之间");
    await apiRequest("/stores", { method: "POST", idempotent: true, body: { storeCode, name, timezone, businessCutoffLocal: cutoff, globalCommissionBps: Math.round(percent * 100) } });
    await onDone();
  }

  async function requestJoin() {
    if (!resolvedStore) {
      setResolvedStore(await apiRequest<{ id: string; name: string; storeCode: string }>(`/stores/resolve-code/${storeCode}`));
      return;
    }
    await apiRequest(`/stores/${resolvedStore.id}/join-requests`, { method: "POST", body: { displayName } });
    setSubmitted(true);
  }

  function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    action().catch((caught) => setError(errorMessage(caught))).finally(() => setBusy(false));
  }

  return (
    <main className="center-page">
      <section className="setup-card">
        <p className="eyebrow">店铺设置</p>
        {submitted ? (
          <><h1>加入申请已提交</h1><p className="field-help">店长或经理批准后，这家店会自动出现在你的店铺列表中。</p><button className="secondary-action" type="button" onClick={() => onDone()}>检查审批结果</button></>
        ) : mode === "choose" ? (
          <><h1>创建或加入店铺</h1><p className="field-help">如果你是店主，请创建新店；如果你是员工，请使用店长提供的 6 位店铺代码。</p><div className="choice-grid"><button type="button" onClick={() => setMode("create")}><strong>创建新店</strong><span>设置项目、提成和营业日</span></button><button type="button" onClick={() => setMode("join")}><strong>加入已有店铺</strong><span>提交后等待店长批准</span></button></div></>
        ) : mode === "create" ? (
          <form onSubmit={(event) => { event.preventDefault(); run(createStore); }}>
            <div className="modal-heading"><div><h1>创建新店</h1></div><button className="close-button" type="button" onClick={() => setMode("choose")}>返回</button></div>
            <div className="editor-grid">
              <label className="field-label">店铺名称<input required maxLength={100} value={name} onChange={(event) => setName(event.target.value)} /></label>
              <label className="field-label">6 位店铺代码<input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={storeCode} onChange={(event) => setStoreCode(event.target.value.replace(/\D/g, "").slice(0, 6))} /><small>由你自己设置，今后员工使用这个代码申请加入</small></label>
              <label className="field-label">时区<input required value={timezone} onChange={(event) => setTimezone(event.target.value)} /></label>
              <label className="field-label">营业日截止时间<input type="time" required value={cutoff} onChange={(event) => setCutoff(event.target.value)} /></label>
              <label className="field-label">全店默认提成（%）<input inputMode="decimal" required value={commission} onChange={(event) => setCommission(event.target.value)} /></label>
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-action" type="submit" disabled={busy}>{busy ? "正在创建…" : "创建店铺"}</button>
          </form>
        ) : (
          <form onSubmit={(event) => { event.preventDefault(); run(requestJoin); }}>
            <div className="modal-heading"><div><h1>加入已有店铺</h1></div><button className="close-button" type="button" onClick={() => setMode("choose")}>返回</button></div>
            <label className="field-label">6 位店铺代码<input disabled={Boolean(resolvedStore)} inputMode="numeric" pattern="[0-9]{6}" maxLength={6} required value={storeCode} onChange={(event) => { setStoreCode(event.target.value.replace(/\D/g, "").slice(0, 6)); setResolvedStore(null); }} /></label>
            {resolvedStore && <div className="resolved-store" role="status"><strong>{resolvedStore.name}</strong><span>店铺代码 {resolvedStore.storeCode}</span><button className="table-action" type="button" onClick={() => setResolvedStore(null)}>不是这家店</button></div>}
            {resolvedStore && <label className="field-label">店内显示名称<input required maxLength={80} value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-action" type="submit" disabled={busy}>{busy ? "正在处理…" : resolvedStore ? "确认并提交加入申请" : "查找店铺"}</button>
          </form>
        )}
      </section>
    </main>
  );
}

function CatalogSetup({ membership, onDone }: { membership: MembershipSummary; onDone: () => Promise<void> }) {
  const [services, setServices] = useState([{ key: crypto.randomUUID(), fullName: "", shortName: "", priceOptions: [{ key: crypto.randomUUID(), duration: "60", price: "" }], commission: "" }]);
  const [addons, setAddons] = useState<Array<{ key: string; name: string; shortName: string; duration: string; amount: string; commission: string }>>([]);
  const [discounts, setDiscounts] = useState<Array<{ key: string; name: string; shortName: string; amount: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const updateServicePrice = (serviceKey: string, optionKey: string, changes: { duration?: string; price?: string }) => {
    setServices((current) => current.map((service) => service.key === serviceKey ? {
      ...service,
      priceOptions: service.priceOptions.map((option) => option.key === optionKey ? { ...option, ...changes } : option),
    } : service));
  };
  if (membership.role === "EMPLOYEE") {
    return <main className="center-page center-page--with-nav"><section className="setup-card"><h1>项目尚未设置</h1><p className="field-help">请联系店长或经理完成主要项目设置后再开始记工。</p><button className="secondary-action" onClick={() => onDone()} type="button">重新检查</button></section><AppNav active="today" storeId={membership.store.id} /></main>;
  }
  return (
    <main className="center-page center-page--with-nav">
      <form className="setup-card setup-card--wide" onSubmit={(event) => {
        event.preventDefault(); setBusy(true); setError("");
        try {
          const amount = (value: string, label: string) => { if (!/^\d+(?:\.\d{0,2})?$/.test(value.trim())) throw new Error(`${label}必须是非负金额，最多两位小数`); return Math.round(Number(value) * 100); };
          const commission = (value: string, label: string) => { if (!/^\d+(?:\.\d{0,2})?$/.test(value.trim()) || Number(value) > 100) throw new Error(`${label}必须在 0% 到 100% 之间`); return Math.round(Number(value) * 100); };
          const serviceItems = services.map((item) => ({
            fullName: item.fullName.trim(), shortName: item.shortName.trim(), priceOptions: item.priceOptions.map((option) => ({ durationMinutes: Number(option.duration), priceCents: amount(option.price, `主要项目“${item.fullName}”${option.duration} 分钟价格`) })),
            ...(item.commission.trim() ? { defaultCommissionBps: commission(item.commission, `主要项目“${item.fullName}”提成`) } : {}),
          }));
          const addonItems = addons.map((item) => ({ name: item.name.trim(), shortName: item.shortName.trim(), amountCents: amount(item.amount, `额外项目“${item.name}”金额`), durationMinutes: item.duration.trim() ? Number(item.duration) : null, ...(item.commission.trim() ? { defaultCommissionBps: commission(item.commission, `额外项目“${item.name}”提成`) } : {}) }));
          const discountItems = discounts.map((item) => ({ name: item.name.trim(), shortName: item.shortName.trim(), amountCents: amount(item.amount, `折扣“${item.name}”金额`) }));
          apiRequest(`/stores/${membership.store.id}/catalog/setup`, { method: "POST", idempotent: true, body: { serviceItems, addonItems, discountItems } }).then(onDone).catch((caught) => setError(errorMessage(caught))).finally(() => setBusy(false));
        } catch (caught) { setError(errorMessage(caught)); setBusy(false); }
      }}>
        <p className="eyebrow">首次设置</p><h1>设置店铺项目</h1><p className="field-help">主要项目至少一项；额外项目和折扣可以现在添加，也可以稍后在“店铺设置”中维护。底部可以进入财务、店铺设置和个人页面；今日和财务页面右下角都有 AI 助手悬浮入口。</p>
        <h2 className="setup-section-title">主要项目</h2>
        <div className="setup-lines">
          {services.map((item, index) => <div className="setup-line setup-line--service" key={item.key}>
            <label>项目全名<input required placeholder="例如：Body Massage" value={item.fullName} onChange={(event) => setServices((current) => current.map((row) => row.key === item.key ? { ...row, fullName: event.target.value } : row))} /></label>
            <label>简称<input required placeholder="Body" maxLength={30} value={item.shortName} onChange={(event) => setServices((current) => current.map((row) => row.key === item.key ? { ...row, shortName: event.target.value } : row))} /></label>
            <div className="setup-price-options"><strong>时长与价格</strong>{item.priceOptions.map((option, optionIndex) => <div className="setup-price-option-row" key={option.key}>
              <label>分钟<input type="number" min="1" max="720" required value={option.duration} onChange={(event) => updateServicePrice(item.key, option.key, { duration: event.target.value })} /></label>
              <label>金额（美元）<input inputMode="decimal" required value={option.price} onChange={(event) => updateServicePrice(item.key, option.key, { price: event.target.value })} /></label>
              {item.priceOptions.length > 1 && <button className="danger-link" type="button" onClick={() => setServices((current) => current.map((service) => service.key === item.key ? { ...service, priceOptions: service.priceOptions.filter((candidate) => candidate.key !== option.key) } : service))}>移除第 {optionIndex + 1} 个价格</button>}
            </div>)}<button className="secondary-action compact" type="button" onClick={() => setServices((current) => current.map((service) => service.key === item.key ? { ...service, priceOptions: [...service.priceOptions, { key: crypto.randomUUID(), duration: "", price: "" }] } : service))}>＋ 添加时长价格</button></div>
            <label>项目提成（%）<input inputMode="decimal" placeholder="可留空" value={item.commission} onChange={(event) => setServices((current) => current.map((row) => row.key === item.key ? { ...row, commission: event.target.value } : row))} /></label>
            {services.length > 1 && <button className="danger-link" type="button" onClick={() => setServices((current) => current.filter((row) => row.key !== item.key))}>移除第 {index + 1} 项</button>}
          </div>)}
        </div>
        <button className="secondary-action" type="button" onClick={() => setServices((current) => [...current, { key: crypto.randomUUID(), fullName: "", shortName: "", priceOptions: [{ key: crypto.randomUUID(), duration: "60", price: "" }], commission: "" }])}>＋ 再加一个项目</button>
        <h2 className="setup-section-title">额外项目（可选）</h2>
        <div className="setup-lines">{addons.map((item, index) => <div className="setup-line setup-line--addon" key={item.key}><label>名称<input required placeholder="例如：热石" value={item.name} onChange={(event) => setAddons((current) => current.map((row) => row.key === item.key ? { ...row, name: event.target.value } : row))} /></label><label>简称<input required maxLength={30} value={item.shortName} onChange={(event) => setAddons((current) => current.map((row) => row.key === item.key ? { ...row, shortName: event.target.value } : row))} /></label><label>分钟<input type="number" min="0" max="720" placeholder="可留空" value={item.duration} onChange={(event) => setAddons((current) => current.map((row) => row.key === item.key ? { ...row, duration: event.target.value } : row))} /></label><label>金额（美元）<input required inputMode="decimal" value={item.amount} onChange={(event) => setAddons((current) => current.map((row) => row.key === item.key ? { ...row, amount: event.target.value } : row))} /></label><label>项目提成（%）<input inputMode="decimal" placeholder="可留空" value={item.commission} onChange={(event) => setAddons((current) => current.map((row) => row.key === item.key ? { ...row, commission: event.target.value } : row))} /></label><button className="danger-link" type="button" onClick={() => setAddons((current) => current.filter((row) => row.key !== item.key))}>移除第 {index + 1} 项</button></div>)}</div>
        <button className="secondary-action" type="button" onClick={() => setAddons((current) => [...current, { key: crypto.randomUUID(), name: "", shortName: "", duration: "", amount: "", commission: "" }])}>＋ 添加额外项目</button>
        <h2 className="setup-section-title">折扣项目（可选）</h2>
        <div className="setup-lines">{discounts.map((item, index) => <div className="setup-line setup-line--discount" key={item.key}><label>名称<input required placeholder="例如：会员优惠" value={item.name} onChange={(event) => setDiscounts((current) => current.map((row) => row.key === item.key ? { ...row, name: event.target.value } : row))} /></label><label>简称<input required maxLength={30} value={item.shortName} onChange={(event) => setDiscounts((current) => current.map((row) => row.key === item.key ? { ...row, shortName: event.target.value } : row))} /></label><label>金额（美元）<input required inputMode="decimal" value={item.amount} onChange={(event) => setDiscounts((current) => current.map((row) => row.key === item.key ? { ...row, amount: event.target.value } : row))} /></label><button className="danger-link" type="button" onClick={() => setDiscounts((current) => current.filter((row) => row.key !== item.key))}>移除第 {index + 1} 项</button></div>)}</div>
        <button className="secondary-action" type="button" onClick={() => setDiscounts((current) => [...current, { key: crypto.randomUUID(), name: "", shortName: "", amount: "" }])}>＋ 添加折扣项目</button>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-action" type="submit" disabled={busy}>{busy ? "正在保存…" : "确认设置并进入今日记工"}</button>
      </form>
      <AppNav active="today" storeId={membership.store.id} />
    </main>
  );
}

export function MassageNoteApp() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [membership, setMembership] = useState<MembershipSummary | null>(null);
  const [currentDay, setCurrentDay] = useState<CurrentBusinessDay | null>(null);
  const [viewDate, setViewDate] = useState("");
  const viewDateRef = useRef("");
  const [initialRecordId, setInitialRecordId] = useState("");
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [storeDetails, setStoreDetails] = useState<StoreDetails | null>(null);
  const [members, setMembers] = useState<StoreMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const storeLoadGeneration = useRef(0);

  const loadMe = useCallback(async () => {
    try {
      const profile = await apiRequest<MeResponse>("/me");
      setMe(profile);
      if (profile.memberships.length > 0) {
        const params = new URL(window.location.href).searchParams;
        const requestedStore = params.get("store");
        const remembered = window.localStorage.getItem("massage_note_store_id");
        const selected = profile.memberships.find((item) => item.store.id === requestedStore) ?? profile.memberships.find((item) => item.store.id === remembered) ?? profile.memberships[0]!;
        const requestedDate = params.get("date");
        if (requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) viewDateRef.current = requestedDate;
        setInitialRecordId(params.get("record") ?? "");
        setMembership(selected);
        window.localStorage.setItem("massage_note_store_id", selected.store.id);
      } else setMembership(null);
    } catch (caught) {
      if ((caught as { status?: number }).status === 401) {
        window.location.replace("/login");
        return;
      }
      setError(errorMessage(caught));
    } finally { setLoading(false); }
  }, []);

  const loadStore = useCallback(async () => {
    if (!membership) return;
    const generation = ++storeLoadGeneration.current;
    const selectedMembership = membership;
    setError("");
    try {
      const day = await apiRequest<CurrentBusinessDay>(`/stores/${selectedMembership.store.id}/business-days/current`);
      const requestedDate = viewDateRef.current || day.businessDate;
      const targetDate = requestedDate <= day.businessDate ? requestedDate : day.businessDate;
      const [nextBoard, nextCatalog, nextStoreDetails] = await Promise.all([
        apiRequest<BoardResponse>(`/stores/${selectedMembership.store.id}/boards/${targetDate}`),
        apiRequest<CatalogResponse>(`/stores/${selectedMembership.store.id}/catalog`),
        apiRequest<StoreDetails>(`/stores/${selectedMembership.store.id}`),
      ]);
      let nextMembers: StoreMember[];
      if (selectedMembership.role !== "EMPLOYEE") {
        nextMembers = await apiRequest<StoreMember[]>(`/stores/${selectedMembership.store.id}/members`);
      } else {
        nextMembers = nextBoard.rows.map((row) => ({ ...row.membership, version: 1, defaultCommissionBps: null, deletedAt: null }));
      }
      if (generation !== storeLoadGeneration.current) return;
      viewDateRef.current = targetDate;
      setViewDate(targetDate);
      setCurrentDay(day); setBoard(deduplicateBoardRows(nextBoard)); setCatalog(nextCatalog); setStoreDetails(nextStoreDetails); setMembers(nextMembers);
    } catch (caught) {
      if (generation === storeLoadGeneration.current) setError(errorMessage(caught));
    }
  }, [membership]);

  useEffect(() => { void loadMe(); }, [loadMe]);
  useEffect(() => { if (membership) void loadStore(); }, [membership, loadStore]);
  const realtimeState = useStoreRealtime(membership?.store.id, loadStore);

  if (loading) return <LoadingPage />;
  if (error && !me) return <main className="center-page"><section className="error-card"><h1>暂时无法打开系统</h1><p>{error}</p><button className="primary-action" onClick={() => window.location.reload()} type="button">重新加载</button></section></main>;
  if (!me) return <LoadingPage />;
  if (me.needsProfile) return <ProfileSetup onDone={loadMe} />;
  if (!membership) return <StoreSetup me={me} onDone={loadMe} />;
  if (!currentDay || !board || !catalog || !storeDetails) return <LoadingPage message={error || "正在读取店铺数据…"} />;
  if (catalog.serviceItems.length === 0) return <CatalogSetup membership={membership} onDone={loadStore} />;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div><p className="eyebrow">{membership.store.name} · 店铺代码 {membership.store.storeCode}</p><h1>{viewDate === currentDay.businessDate ? "今日记工" : "历史记工"}</h1><p className="business-date">{chineseDate(viewDate)} · 营业日截止 {currentDay.businessCutoffLocal} <span className={`sync-status ${realtimeState === "网络已断开" ? "offline" : ""}`}>{realtimeState}</span></p></div>
        <div className="topbar-actions">
          {me.memberships.length > 1 && <select className="store-switcher" aria-label="切换店铺" value={membership.store.id} onChange={(event) => {
            const selected = me.memberships.find((item) => item.store.id === event.target.value); if (selected) { storeLoadGeneration.current += 1; viewDateRef.current = ""; setViewDate(""); setMembership(selected); setCurrentDay(null); setBoard(null); setStoreDetails(null); window.localStorage.setItem("massage_note_store_id", selected.store.id); }
          }}>{me.memberships.map((item) => <option key={item.store.id} value={item.store.id}>{item.store.name}</option>)}</select>}
          <button className="store-switcher" type="button" onClick={() => apiRequest("/auth/session", { method: "DELETE" }).finally(() => window.location.replace("/login"))}>退出</button>
        </div>
      </header>
      <section className="history-toolbar" aria-label="切换营业日"><form className="history-date-form" onSubmit={(event) => { event.preventDefault(); const value = new FormData(event.currentTarget).get("businessDate"); if (typeof value !== "string" || !value) return; viewDateRef.current = value; void loadStore(); }}><label>{membership.role === "EMPLOYEE" ? "查看自己的营业日" : "查看营业日"}<input key={viewDate} name="businessDate" type="date" defaultValue={viewDate} max={currentDay.businessDate} /></label><button className="secondary-action compact" type="submit">查看</button></form>{viewDate !== currentDay.businessDate && <button className="secondary-action" type="button" onClick={() => { viewDateRef.current = currentDay.businessDate; void loadStore(); }}>返回今天</button>}<span>{viewDate === currentDay.businessDate ? "当前营业日" : membership.role === "EMPLOYEE" ? "历史营业日；只显示你自己的记工" : "历史营业日；已日结时须先取消日结才能修改"}</span></section>
      {error && <p className="form-error" role="alert">{error}</p>}
      <TodayBoard key={`today-${membership.store.id}-${viewDate}`} membership={membership} store={storeDetails} currentDay={{ ...currentDay, businessDate: viewDate }} isCurrentBusinessDay={viewDate === currentDay.businessDate} board={board} catalog={catalog} members={members} initialRecordId={initialRecordId || undefined} onInitialRecordOpened={() => { setInitialRecordId(""); const url = new URL(window.location.href); url.searchParams.delete("record"); window.history.replaceState(null, "", `${url.pathname}${url.search}`); }} onReload={loadStore} />
      <FloatingAiAssistant key={`work-ai-${membership.store.id}`} storeId={membership.store.id} type="work" onWorkChanged={loadStore} />
      <AppNav active="today" storeId={membership.store.id} />
    </main>
  );
}
