"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { apiRequest, errorMessage } from "../../lib/api";
import { displayUsPhone, effectiveClosingDeliveryPhone } from "../../lib/member-closing-delivery";
import { filterMembers, isMemberDraftDirty, memberDraft, parseCommissionPercent, saveMemberSettings, type EmploymentType, type MemberDraft, type MemberFilter, type MemberRoleFilter } from "../../lib/member-management";
import type { CatalogResponse, CommissionHistoryResponse, JoinRequest, StoreMember } from "../../lib/types";
import { useLanguage } from "../language-provider";
import { UiIcon } from "../ui/primitives";
import { useAutoDismissState } from "../use-auto-dismiss-state";
import { MembersToolbar } from "./members-toolbar";

const roleText = { OWNER: "店主", MANAGER: "经理", EMPLOYEE: "员工" } as const;
const employmentText = { FULL_TIME: "全职", PART_TIME: "兼职" } as const;
type MemberAction = (action: () => Promise<void>) => Promise<void>;
type DialogState = { kind: "create" } | { kind: "deactivate" | "restore"; member: StoreMember } | { kind: "review"; request: JoinRequest };

interface MembersPanelProps {
  storeId: string;
  dailyRankingEnabled: boolean;
  members: StoreMember[];
  requests: JoinRequest[];
  catalog: CatalogResponse;
  busy: boolean;
  run: MemberAction;
  reload: () => Promise<void>;
  onDirtyChange: (value: boolean) => void;
}

export function MembersPanel({ storeId, dailyRankingEnabled, members, requests, catalog, busy, run, reload, onDirtyChange }: MembersPanelProps) {
  const { t, locale } = useLanguage();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<MemberFilter>("ACTIVE");
  const [role, setRole] = useState<MemberRoleFilter>("ALL");
  const [selectedMember, setSelectedMember] = useState<StoreMember | null>(null);
  const [detailTab, setDetailTab] = useState<"settings" | "commission" | "account">("settings");
  const [editorRevision, setEditorRevision] = useState(0);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [dirty, setDirty] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useAutoDismissState("");
  const submitting = useRef(false);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const active = members.filter((member) => member.status === "ACTIVE");
  const pending = requests.filter((request) => request.status === "PENDING");
  const counts = { ACTIVE: active.length, UNCLAIMED: active.filter((member) => !member.user).length, INACTIVE: members.length - active.length, ALL: members.length };
  const visible = filterMembers(members, query, filter, role);
  const disabled = busy || working;
  const latest = members.find((member) => member.id === selectedMember?.id);
  const current = latest ?? selectedMember;

  useEffect(() => { onDirtyChange(dirty); }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [dirty]);
  useEffect(() => { if (selectedMember) detailHeading.current?.focus(); }, [selectedMember?.id]);

  function mayLeave() {
    return !disabled && (!dirty || window.confirm(t("有未保存的修改，确认放弃吗？")));
  }
  function choose(member: StoreMember | null) {
    if (selectedMember?.id === member?.id || !mayLeave()) return;
    setSelectedMember(member); setDetailTab("settings"); setDirty(false); setError(""); setEditorRevision((value) => value + 1);
  }
  function discard() {
    if (!mayLeave()) return;
    if (latest) setSelectedMember(latest);
    setDirty(false); setError(""); setEditorRevision((value) => value + 1);
  }
  function open(next: DialogState) {
    if (!mayLeave()) return;
    if (latest) setSelectedMember(latest);
    setEditorRevision((value) => value + 1); setError(""); setDirty(false); setDialog(next);
  }
  function close() {
    if (submitting.current || !mayLeave()) return;
    setDialog(null); setDirty(false); setError("");
  }
  async function act(action: () => Promise<void>) {
    if (submitting.current || busy) return;
    submitting.current = true; setWorking(true); setError("");
    try {
      await run(async () => {
        try { await action(); }
        catch (caught) {
          // Keep the draft through conflicts and partial metadata/commission saves.
          try { await reload(); } catch { /* Keep the original actionable error. */ }
          setError(errorMessage(caught));
        }
      });
    } finally { submitting.current = false; setWorking(false); }
  }
  async function finish(message: string) {
    setDialog(null); setDirty(false); setNotice(message);
    await reload();
  }
  const dialogMember = dialog && "member" in dialog ? members.find((member) => member.id === dialog.member.id) : undefined;
  const title = dialog?.kind === "create" ? "新增员工" : dialog?.kind === "deactivate" ? "停用成员" : dialog?.kind === "restore" ? "恢复成员" : "处理加入申请";

  return <section className="manage-section members-workspace">
    <div className="members-page-heading"><div><h2>团队名册</h2><p>选择一位员工，集中管理资料、提成与日结设置。</p></div><button className="primary-action" type="button" disabled={disabled} onClick={() => open({ kind: "create" })}><UiIcon name="plus" />新增员工</button></div>
    <div className="members-overview" aria-label="团队概况">
      <div><span>在职成员</span><strong>{counts.ACTIVE}</strong></div>
      <div><span>参与记工</span><strong>{active.filter((member) => member.isServiceProvider).length}</strong></div>
      <div><span>等待注册</span><strong>{counts.UNCLAIMED}</strong></div>
      <div className={pending.length ? "members-overview__pending" : ""}><span>加入申请</span><strong>{pending.length}</strong></div>
    </div>
    {notice && <p className="success-banner" role="status">{notice}</p>}
    {error && !dialog && <p className="form-error" role="alert">{error}</p>}
    {pending.length > 0 && <details className="members-requests"><summary><span><UiIcon name="user" />加入申请<span className="members-badge members-badge--pending">{pending.length}</span></span><span className="field-help">核对账号后批准加入</span></summary><div className="members-requests__list">{pending.map((request) => <article key={request.id}><div className="member-avatar" aria-hidden="true">{Array.from(request.requestedDisplayName)[0]}</div><div className="members-identity"><strong>{request.requestedDisplayName}</strong><span><span>账号姓名</span>：{[request.user.firstName, request.user.lastName].filter(Boolean).join(" ") || t("未填写")}</span><span>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(request.createdAt))}</span></div><button className="secondary-action compact" type="button" disabled={disabled} onClick={() => open({ kind: "review", request })}>处理申请</button></article>)}</div></details>}
    <div className={`members-master-detail${selectedMember ? " has-selection" : ""}`}>
      <section className="members-directory" aria-label="成员列表">
        <MembersToolbar query={query} filter={filter} role={role} counts={counts} onQuery={setQuery} onFilter={setFilter} onRole={setRole} />
        <div className="members-roster">{visible.map((member) => <button key={member.id} className={`members-roster-item${selectedMember?.id === member.id ? " is-selected" : ""}`} type="button" disabled={disabled} aria-pressed={selectedMember?.id === member.id} aria-controls="member-detail" onClick={() => choose(member)}>
          <span className="member-avatar" aria-hidden="true">{Array.from(member.displayName)[0]}</span>
          <span className="members-identity"><strong>{member.displayName}</strong><span><span>{roleText[member.role]}</span>{member.isServiceProvider && member.employmentType && <> · <span>{employmentText[member.employmentType]}</span></>}</span></span>
          <span className={`members-badge ${member.status !== "ACTIVE" ? "members-badge--muted" : member.user ? "members-badge--success" : "members-badge--pending"}`}>{member.status !== "ACTIVE" ? "已停用" : member.user ? "在职" : "等待注册"}</span>
        </button>)}</div>
        {visible.length === 0 && <div className="members-empty"><UiIcon name="user" /><strong>{members.length === 0 ? "还没有成员" : "没有符合条件的成员"}</strong><p>{members.length === 0 ? "添加员工后即可开始记工，账号可以稍后注册关联。" : "试试其他姓名、手机号或筛选条件。"}</p>{members.length === 0 ? <button className="primary-action compact" type="button" disabled={disabled} onClick={() => open({ kind: "create" })}>新增员工</button> : <button className="secondary-action compact" type="button" onClick={() => { setQuery(""); setRole("ALL"); setFilter("ALL"); }}>查看全部成员</button>}</div>}
        <div className="members-directory__footer"><span><span>当前显示</span> {visible.length} / {members.length}</span></div>
      </section>
      <section className="member-detail" id="member-detail" aria-label="员工详情">
        {selectedMember && current ? <>
          <header className="member-detail__heading">
            <button className="table-action member-detail__back" type="button" disabled={disabled} onClick={() => choose(null)}>返回员工列表</button>
            <div className="members-person"><span className="member-avatar" aria-hidden="true">{Array.from(current.displayName)[0]}</span><div><p className="eyebrow">员工档案</p><h2 ref={detailHeading} tabIndex={-1}>{current.displayName}</h2><p><span>{roleText[current.role]}</span> · <span>{current.status === "ACTIVE" ? current.isServiceProvider ? "参与记工" : "不参与记工" : "已离职/停用"}</span></p></div></div>
          </header>
          {selectedMember.status === "ACTIVE" && latest ? <>
            <nav className="member-detail-tabs" aria-label="员工设置">{([["settings", "资料与工资"], ["commission", "项目专属提成"], ["account", "账号与状态"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={detailTab === value} disabled={disabled} onClick={() => {
              if (value === detailTab || !mayLeave()) return;
              setSelectedMember(latest); setDetailTab(value); setDirty(false); setError(""); setEditorRevision((revision) => revision + 1);
            }}>{label}</button>)}</nav>
            {detailTab === "settings" && !dialog && <MemberEditor key={`${selectedMember.id}-${editorRevision}`} member={selectedMember} latest={latest} dailyRankingEnabled={dailyRankingEnabled} busy={disabled} onDirty={setDirty} onCancel={discard} clearError={() => setError("")} onSubmit={(member, draft, progress) => act(async () => {
              const result = await saveMemberSettings(storeId, member, draft, dailyRankingEnabled, progress);
              setSelectedMember(result.member); setEditorRevision((revision) => revision + 1);
              await finish(result.refreshedToday ? "成员资料已保存，今日记工小结已同步。" : "成员资料已保存。");
            })} />}
            {detailTab === "commission" && !dialog && <ItemCommissionForm key={`${selectedMember.id}-${editorRevision}`} storeId={storeId} member={selectedMember} latest={latest} catalog={catalog} busy={disabled} onDirty={setDirty} onCancel={discard} act={act} onSaved={async () => { await finish("项目提成已保存。"); setEditorRevision((revision) => revision + 1); }} />}
            {detailTab === "account" && <MemberAccount member={current} busy={disabled} onDeactivate={() => open({ kind: "deactivate", member: current })} />}
          </> : <div className="member-detail__inactive"><p className="member-info-note">{latest ? "停用成员的历史记工与财务记录会保留。" : "此成员已不在当前名单中，请重新选择。"}</p>{latest && current.role !== "OWNER" && <button className="primary-action" type="button" disabled={disabled} onClick={() => open({ kind: "restore", member: current })}>恢复成员</button>}</div>}
        </> : <div className="member-detail__empty"><UiIcon name="user" /><p className="eyebrow">团队管理</p><h2>先选择一位员工</h2><p>从员工列表选择已有成员，再查看和更改详细设置。</p><div><span>01 · 选择员工</span><span>02 · 调整设置</span><span>03 · 保存修改</span></div></div>}
      </section>
    </div>
    {dialog && <MemberSheet title={title} name={"member" in dialog ? dialog.member.displayName : dialog.kind === "review" ? dialog.request.requestedDisplayName : undefined} busy={disabled} error={error} onClose={close}>
      {dialog.kind === "create" && <CreateMemberForm busy={disabled} onDirty={setDirty} onCancel={close} onSubmit={(name, employmentType, dailySettlementEnabled) => act(async () => {
        const member = await apiRequest<StoreMember>(`/stores/${storeId}/members`, { method: "POST", body: { name, employmentType, dailySettlementEnabled } });
        setFilter("ACTIVE"); setQuery(""); setRole("ALL"); setSelectedMember(member); setDetailTab("settings"); setEditorRevision((revision) => revision + 1); await finish("员工已创建，可以开始记工。");
      })} />}
      {(dialog.kind === "deactivate" || dialog.kind === "restore") && <MemberStatusForm kind={dialog.kind} member={dialog.member} latest={dialogMember} dailyRankingEnabled={dailyRankingEnabled} busy={disabled} onDirty={setDirty} onCancel={close} onSubmit={(body) => act(async () => {
        const member = await apiRequest<StoreMember>(`/stores/${storeId}/members/${dialog.member.id}${dialog.kind === "restore" ? "/restore" : ""}`, { method: dialog.kind === "restore" ? "POST" : "DELETE", body: { version: dialog.member.version, ...body } });
        setSelectedMember(member); setDetailTab("settings"); setEditorRevision((revision) => revision + 1);
        setFilter(dialog.kind === "restore" ? "ACTIVE" : "INACTIVE"); setQuery(""); setRole("ALL");
        await finish(dialog.kind === "restore" ? "成员已恢复，可以继续记工。" : "成员已停用，历史记录已保留。");
      })} />}
      {dialog.kind === "review" && <JoinRequestForm request={dialog.request} latest={pending.find((request) => request.id === dialog.request.id)} busy={disabled} onDirty={setDirty} onCancel={close} onSubmit={(decision, body) => act(async () => {
        await apiRequest(`/stores/${storeId}/join-requests/${dialog.request.id}/${decision}`, { method: "POST", body: { version: dialog.request.version, ...body } });
        await finish(decision === "approve" ? "已批准加入申请。" : "已拒绝加入申请。");
      })} />}
    </MemberSheet>}
  </section>;
}

function MemberAccount({ member, busy, onDeactivate }: { member: StoreMember; busy: boolean; onDeactivate: () => void }) {
  const phone = displayUsPhone(effectiveClosingDeliveryPhone(member.closingDeliveryPhoneE164, member.user?.phoneE164));
  return <div className="member-account">
    <section><h3>关联账号</h3><dl><div><dt>账号姓名</dt><dd>{member.user ? [member.user.firstName, member.user.lastName].filter(Boolean).join(" ") || "未填写" : "等待注册"}</dd></div><div><dt>注册号码</dt><dd>{displayUsPhone(member.user?.phoneE164) || "未填写"}</dd></div><div><dt>日结短信</dt><dd>{member.closingDeliveryEnabled ? phone || "缺少接收号码" : "未开启"}</dd></div></dl>{!member.user && <p className="member-info-note">员工以后用相同注册名字加入本店，会自动关联已有记工和提成。</p>}</section>
    <section className="member-account__status"><h3>成员状态</h3><p>停用成员的历史记工与财务记录会保留。</p>{member.role === "OWNER" ? <p className="field-help">店主身份通过店铺设置中的转移流程修改。</p> : <button className="secondary-action danger" type="button" disabled={busy} onClick={onDeactivate}>停用成员</button>}</section>
  </div>;
}

function MemberSheet({ title, name, children, busy, error, onClose }: { title: string; name?: string | undefined; children: ReactNode; busy: boolean; error: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => { element?.close(); if (previous?.isConnected) previous.focus(); };
  }, []);
  return <dialog ref={dialog} className="member-sheet" aria-labelledby="member-sheet-title" aria-describedby={name ? "member-sheet-name" : undefined} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
    <header className="member-sheet__heading"><div><p className="eyebrow">成员管理</p><h2 id="member-sheet-title">{title}</h2>{name && <p id="member-sheet-name">{name}</p>}</div><button className="close-button" type="button" disabled={busy} onClick={onClose}>关闭</button></header>
    {error && <p className="form-error member-sheet__error" role="alert">{error}</p>}
    {children}
  </dialog>;
}

function SheetFooter({ busy, onCancel, children, hint, cancelLabel = "取消" }: { busy: boolean; onCancel: () => void; children: ReactNode; hint?: string | undefined; cancelLabel?: string }) {
  return <footer className="member-sheet__footer">{hint && <p className="field-help">{hint}</p>}<div><button className="secondary-action" type="button" disabled={busy} onClick={onCancel}>{cancelLabel}</button>{children}</div></footer>;
}

function EmploymentSelect({ value, onChange, required = false, disabled = false }: { value: EmploymentType | ""; onChange: (value: EmploymentType | "") => void; required?: boolean; disabled?: boolean }) {
  return <label>全职/兼职<select value={value} required={required} disabled={disabled} onChange={(event) => onChange(event.target.value as EmploymentType | "")}><option value="" disabled={required}>未设置</option><option value="FULL_TIME">全职</option><option value="PART_TIME">兼职</option></select></label>;
}

function SettingToggle({ label, help, checked, disabled = false, onChange }: { label: string; help: string; checked: boolean; disabled?: boolean; onChange: (value: boolean) => void }) {
  return <label className="member-setting-toggle"><span><strong>{label}</strong><small>{help}</small></span><input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} /></label>;
}

function CreateMemberForm({ busy, onDirty, onCancel, onSubmit }: { busy: boolean; onDirty: (value: boolean) => void; onCancel: () => void; onSubmit: (name: string, employmentType: EmploymentType, dailySettlementEnabled: boolean) => Promise<void> }) {
  const [name, setName] = useState("");
  const [employmentType, setEmploymentType] = useState<EmploymentType>("PART_TIME");
  const [dailySettlementEnabled, setDailySettlementEnabled] = useState(false);
  useEffect(() => { onDirty(Boolean(name.trim()) || employmentType !== "PART_TIME" || dailySettlementEnabled); }, [name, employmentType, dailySettlementEnabled, onDirty]);
  return <form className="member-sheet__form" onSubmit={(event) => { event.preventDefault(); if (name.trim()) void onSubmit(name.trim(), employmentType, dailySettlementEnabled); }}><div className="member-sheet__body">
    <p className="member-info-note">只需名字即可建档。员工以后用相同注册名字加入本店，会自动关联已有记工和提成。</p>
    <fieldset className="member-settings-group" disabled={busy}><legend>员工资料</legend><div className="member-settings-group__body"><div className="member-settings-grid"><label>员工名字<input autoFocus required maxLength={80} autoComplete="off" value={name} onChange={(event) => setName(event.target.value)} /></label><EmploymentSelect required value={employmentType} onChange={(value) => { if (value) setEmploymentType(value); }} /></div><p className="field-help">新员工默认拥有员工权限并参与记工，可在建档后调整。</p></div></fieldset>
    <fieldset className="member-settings-group" disabled={busy}><legend>工资设置</legend><div className="member-settings-group__body"><SettingToggle label="每日结清" help="开启后，个人日结发放全部大费工资与非现金小费。" checked={dailySettlementEnabled} onChange={setDailySettlementEnabled} /></div></fieldset>
  </div><SheetFooter busy={busy} onCancel={onCancel}><button className="primary-action" type="submit" disabled={busy || !name.trim()}>{busy ? "正在创建…" : "创建员工"}</button></SheetFooter></form>;
}

function MemberEditor({ member, latest, dailyRankingEnabled, busy, onDirty, onCancel, clearError, onSubmit }: { member: StoreMember; latest: StoreMember | undefined; dailyRankingEnabled: boolean; busy: boolean; onDirty: (value: boolean) => void; onCancel: () => void; clearError: () => void; onSubmit: (member: StoreMember, draft: MemberDraft, progress: (member: StoreMember) => void) => Promise<void> }) {
  const [base, setBase] = useState(member);
  const [draft, setDraft] = useState(() => memberDraft(member));
  const dirty = isMemberDraftDirty(base, draft);
  const stale = !latest || latest.version > base.version || latest.status !== "ACTIVE";
  const owner = base.role === "OWNER";
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  function update<K extends keyof MemberDraft>(key: K, value: MemberDraft[K]) { setDraft((current) => ({ ...current, [key]: value })); }
  return <form className="member-sheet__form" onSubmit={(event) => { event.preventDefault(); if (!busy && !stale && dirty) void onSubmit(base, draft, setBase); }}><div className="member-sheet__body">
    {stale && <div className="member-conflict" role="status"><p>资料已更新，当前输入已保留。请载入最新资料后重新核对。</p>{latest?.status === "ACTIVE" && <button className="secondary-action compact" type="button" disabled={busy} onClick={() => { setBase(latest); setDraft(memberDraft(latest)); clearError(); }}>载入最新资料</button>}</div>}
    <fieldset className="member-settings-group" disabled={busy || stale}><legend>资料与权限</legend><div className="member-settings-group__body"><div className="member-settings-grid">
      <label>店内显示名<input autoFocus required maxLength={80} value={draft.displayName} onChange={(event) => update("displayName", event.target.value)} /></label>
      <label>角色<select disabled={owner} value={draft.role} onChange={(event) => update("role", event.target.value as "MANAGER" | "EMPLOYEE")}>{owner && <option value="OWNER">店主</option>}<option value="EMPLOYEE">员工</option><option value="MANAGER">经理</option></select></label>
      <EmploymentSelect value={draft.employmentType} disabled={!draft.isServiceProvider} required={dailyRankingEnabled && draft.isServiceProvider} onChange={(value) => update("employmentType", value)} />
    </div><SettingToggle label="参与记工" help="开启后可加入每日员工表格并记录服务。" checked={draft.isServiceProvider} disabled={owner} onChange={(value) => update("isServiceProvider", value)} />
      {owner && <p className="field-help">店主身份通过店铺设置中的转移流程修改。</p>}
      {draft.role === "MANAGER" && <p className="member-info-note">经理可以管理成员、项目与店铺财务，请谨慎授予。</p>}
    </div></fieldset>
    <fieldset className="member-settings-group" disabled={busy || stale}><legend>工资与提成</legend><div className="member-settings-group__body"><label>员工默认提成（%）<input inputMode="decimal" placeholder="留空则沿用项目或店铺提成" value={draft.commissionPercent} onChange={(event) => update("commissionPercent", event.target.value)} /></label><p className="field-help">项目专属比例 → 员工默认比例 → 项目默认比例 → 全店默认比例。保存员工提成后会重算未日结的当前营业日；已日结和历史记工继续使用原快照。</p><SettingToggle label="每日结清" help="发放全部大费工资与刷卡/礼物卡小费；现金小费由员工直接收取。" checked={draft.dailySettlementEnabled} onChange={(value) => update("dailySettlementEnabled", value)} /></div></fieldset>
    <fieldset className="member-settings-group" disabled={busy || stale}><legend>日结短信</legend><div className="member-settings-group__body"><SettingToggle label="接收个人日结短信" help="日结时发送个人小结，需要有效的接收号码。" checked={draft.closingDeliveryEnabled} onChange={(value) => update("closingDeliveryEnabled", value)} /><div className="member-settings-grid"><label>短信接收号码<input type="tel" inputMode="tel" autoComplete="tel-national" disabled={!draft.closingDeliveryEnabled} value={draft.closingDeliveryPhone} onChange={(event) => update("closingDeliveryPhone", displayUsPhone(event.target.value))} /><small>填写 10 位美国号码，无需 +1；留空则使用注册号码。</small></label><label>图片语言<select disabled={!draft.closingDeliveryEnabled} value={draft.closingImageLocale} onChange={(event) => update("closingImageLocale", event.target.value as MemberDraft["closingImageLocale"])}><option value="">使用店铺默认</option><option value="zh_CN">中文</option><option value="en_US">English</option></select></label></div></div></fieldset>
  </div><SheetFooter busy={busy} onCancel={onCancel} cancelLabel="重置修改" hint={dirty ? "有未保存的修改" : "资料未修改"}><button className="primary-action" type="submit" disabled={busy || stale || !dirty || !draft.displayName.trim() || (dailyRankingEnabled && draft.isServiceProvider && !draft.employmentType)}>{busy ? "正在保存…" : "保存修改"}</button></SheetFooter></form>;
}

function ItemCommissionForm({ storeId, member, latest, catalog, busy, onDirty, onCancel, act, onSaved }: { storeId: string; member: StoreMember; latest: StoreMember | undefined; catalog: CatalogResponse; busy: boolean; onDirty: (value: boolean) => void; onCancel: () => void; act: MemberAction; onSaved: () => Promise<void> }) {
  const [history, setHistory] = useState<CommissionHistoryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [itemKey, setItemKey] = useState("");
  const [percent, setPercent] = useState("");
  const services = catalog.serviceItems.filter((item) => !item.deletedAt);
  const addons = catalog.addonItems.filter((item) => !item.deletedAt);
  const rules = history?.itemHistory.filter((item) => item.effectiveTo === null) ?? [];
  const stale = !latest || latest.status !== "ACTIVE" || Boolean(history && latest.version > history.membership.version);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError("");
    void apiRequest<CommissionHistoryResponse>(`/stores/${storeId}/members/${member.id}/commissions`, { signal: controller.signal }).then((result) => { if (!controller.signal.aborted) setHistory(result); }).catch((caught) => { if (!controller.signal.aborted) setLoadError(errorMessage(caught)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [storeId, member.id, attempt]);
  useEffect(() => { onDirty(Boolean(itemKey)); }, [itemKey, onDirty]);
  function choose(value: string) {
    setItemKey(value);
    const [itemType, itemId] = value.split(":");
    const rule = rules.find((rule) => rule.itemType === itemType && rule.itemId === itemId);
    setPercent(rule ? String(rule.commissionBps / 100) : "");
  }
  async function save() {
    if (!history || stale || !itemKey || loading || busy) return;
    const [itemType, itemId] = itemKey.split(":") as ["SERVICE" | "ADDON", string];
    const commissionBps = parseCommissionPercent(percent);
    await apiRequest(`/stores/${storeId}/members/${member.id}/commissions/item`, { method: "PUT", idempotent: true, body: { version: history.membership.version, itemType, itemId, commissionBps } });
    await onSaved();
  }
  return <form className="member-sheet__form" onSubmit={(event) => { event.preventDefault(); void act(save); }}><div className="member-sheet__body">
    <p className="member-info-note">项目专属提成优先于员工、项目和店铺默认提成。只影响未日结的当前营业日。</p>
    {loading ? <p role="status">正在读取提成规则…</p> : loadError ? <div className="member-conflict"><p role="alert">{loadError}</p><button className="secondary-action compact" type="button" onClick={() => setAttempt((value) => value + 1)}>重新读取</button></div> : <>
      {stale && <div className="member-conflict"><p>资料已更新，请重新读取提成规则后核对。</p><button className="secondary-action compact" type="button" disabled={busy} onClick={() => { setItemKey(""); setPercent(""); setAttempt((value) => value + 1); }}>重新读取</button></div>}
      <fieldset className="member-settings-group" disabled={busy || stale}><legend>设置项目规则</legend><div className="member-settings-group__body"><label>选择项目<select autoFocus required value={itemKey} onChange={(event) => choose(event.target.value)}><option value="">选择主要或额外项目</option><optgroup label="主要项目">{services.map((item) => <option key={item.id} value={`SERVICE:${item.id}`}>{item.shortName}</option>)}</optgroup><optgroup label="额外项目">{addons.map((item) => <option key={item.id} value={`ADDON:${item.id}`}>{item.shortName}</option>)}</optgroup></select></label><label>项目专属提成（%）<input inputMode="decimal" value={percent} onChange={(event) => setPercent(event.target.value)} placeholder="留空则清除该项目规则" /></label><p className="field-help">留空比例会清除该项目专属规则，并继续使用下一层规则。</p></div></fieldset>
      <section className="member-current-rules"><h3>生效中的项目规则</h3>{rules.length === 0 ? <p className="field-help">暂无生效中的项目专属规则。</p> : <ul>{rules.map((rule) => { const name = (rule.itemType === "SERVICE" ? catalog.serviceItems : catalog.addonItems).find((item) => item.id === rule.itemId)?.shortName; return <li key={rule.id}><span>{name || "已删除项目"}</span><strong>{rule.commissionBps / 100}%</strong></li>; })}</ul>}</section>
    </>}
  </div><SheetFooter busy={busy} onCancel={onCancel} cancelLabel="重置修改"><button className="primary-action" type="submit" disabled={busy || loading || Boolean(loadError) || stale || !itemKey}>{busy ? "正在保存…" : itemKey && !percent.trim() ? "清除项目规则" : "保存规则"}</button></SheetFooter></form>;
}

function MemberStatusForm({ kind, member, latest, dailyRankingEnabled, busy, onDirty, onCancel, onSubmit }: { kind: "deactivate" | "restore"; member: StoreMember; latest: StoreMember | undefined; dailyRankingEnabled: boolean; busy: boolean; onDirty: (value: boolean) => void; onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void> }) {
  const [name, setName] = useState(member.displayName);
  const [reason, setReason] = useState("");
  const [employmentType, setEmploymentType] = useState<EmploymentType | "">(member.employmentType ?? "");
  const restore = kind === "restore";
  const stale = !latest || latest.version !== member.version;
  useEffect(() => { onDirty(Boolean(reason) || name !== member.displayName || employmentType !== (member.employmentType ?? "")); }, [reason, name, employmentType, member, onDirty]);
  return <form className="member-sheet__form" onSubmit={(event) => { event.preventDefault(); if (!busy && !stale) void onSubmit(restore ? { displayName: name.trim(), employmentType: employmentType || null } : { reason: reason.trim() }); }}><div className="member-sheet__body">
    <p className="member-info-note">{restore ? "恢复后可以重新加入每日表格，原有提成与历史记录继续保留。" : "停用后不能再登录本店或参与记工，历史记工与财务记录仍保留，可随时恢复。"}</p>
    {stale && <p className="member-conflict" role="status">资料已更新，请关闭后重新打开并核对。</p>}
    <fieldset className="member-settings-group" disabled={busy || stale}><legend>{restore ? "恢复资料" : "停用原因"}</legend><div className="member-settings-group__body">{restore ? <><label>店内显示名<input autoFocus required maxLength={80} value={name} onChange={(event) => setName(event.target.value)} /></label><EmploymentSelect value={employmentType} required={dailyRankingEnabled && member.isServiceProvider} disabled={!member.isServiceProvider} onChange={setEmploymentType} /></> : <label>离职或停用原因<textarea autoFocus required maxLength={500} rows={4} value={reason} onChange={(event) => setReason(event.target.value)} /></label>}</div></fieldset>
  </div><SheetFooter busy={busy} onCancel={onCancel}><button className={`primary-action${restore ? "" : " member-danger-action"}`} type="submit" disabled={busy || stale || (restore ? !name.trim() || dailyRankingEnabled && member.isServiceProvider && !employmentType : !reason.trim())}>{busy ? "正在处理…" : restore ? "恢复为在职成员" : "确认停用"}</button></SheetFooter></form>;
}

function JoinRequestForm({ request, latest, busy, onDirty, onCancel, onSubmit }: { request: JoinRequest; latest: JoinRequest | undefined; busy: boolean; onDirty: (value: boolean) => void; onCancel: () => void; onSubmit: (decision: "approve" | "reject", body: Record<string, unknown>) => Promise<void> }) {
  const [decision, setDecision] = useState<"approve" | "reject">("approve");
  const [employmentType, setEmploymentType] = useState<EmploymentType>("PART_TIME");
  const [reviewNote, setReviewNote] = useState("");
  const stale = !latest || latest.version !== request.version;
  useEffect(() => { onDirty(decision !== "approve" || employmentType !== "PART_TIME" || Boolean(reviewNote)); }, [decision, employmentType, reviewNote, onDirty]);
  return <form className="member-sheet__form" onSubmit={(event) => { event.preventDefault(); if (!busy && !stale) void onSubmit(decision, decision === "approve" ? { role: "EMPLOYEE", isServiceProvider: true, employmentType } : reviewNote.trim() ? { reviewNote: reviewNote.trim() } : {}); }}><div className="member-sheet__body">
    <div className="member-info-note"><span>账号姓名</span>：{[request.user.firstName, request.user.lastName].filter(Boolean).join(" ") || "未填写"}<p>批准后将拥有员工权限并参与记工，请先核对申请人身份。</p></div>
    {stale && <p className="member-conflict" role="status">申请已被处理，请关闭后查看最新名单。</p>}
    <fieldset className="member-settings-group" disabled={busy || stale}><legend>处理方式</legend><div className="member-settings-group__body"><div className="member-decision-options"><label><input autoFocus type="radio" name="decision" value="approve" checked={decision === "approve"} onChange={() => setDecision("approve")} />批准为员工</label><label><input type="radio" name="decision" value="reject" checked={decision === "reject"} onChange={() => setDecision("reject")} />拒绝申请</label></div>{decision === "approve" ? <EmploymentSelect value={employmentType} required onChange={(value) => { if (value) setEmploymentType(value); }} /> : <label>拒绝备注（选填）<textarea maxLength={500} rows={4} value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} /></label>}</div></fieldset>
  </div><SheetFooter busy={busy} onCancel={onCancel}><button className={`primary-action${decision === "reject" ? " member-danger-action" : ""}`} type="submit" disabled={busy || stale}>{busy ? "正在处理…" : decision === "approve" ? "批准加入" : "确认拒绝"}</button></SheetFooter></form>;
}
