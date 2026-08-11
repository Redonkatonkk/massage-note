"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, errorMessage } from "../../lib/api";
import type {
  AddonItem,
  AuditLogItem,
  AuditLogPage,
  CatalogResponse,
  CommissionHistoryResponse,
  DiscountItem,
  DeletedWorkRecord,
  JoinRequest,
  MeResponse,
  MembershipSummary,
  ServiceItem,
  StoreDetails,
  StoreMember,
} from "../../lib/types";
import { useStoreRealtime } from "../../lib/realtime";
import { AppNav } from "../app-nav";

type ManageTab = "store" | "members" | "catalog" | "recovery" | "audit";
type CatalogKind = "SERVICE" | "ADDON" | "DISCOUNT";

const roleText = { OWNER: "店主", MANAGER: "经理", EMPLOYEE: "员工" } as const;

const actionText: Record<string, string> = {
  "store.created": "创建店铺",
  "store.settings_updated": "修改店铺设置",
  "store.owner_transferred": "转移店主",
  "store.deleted": "删除店铺",
  "membership.join_requested": "申请加入店铺",
  "membership.join_approved": "批准加入申请",
  "membership.join_approved_and_restored": "批准并恢复成员",
  "membership.join_rejected": "拒绝加入申请",
  "membership.updated": "修改成员",
  "membership.deactivated": "成员离职或停用",
  "membership.restored": "恢复成员",
  "catalog.initialized": "初始化项目",
  "catalog.item_created": "新增项目",
  "catalog.item_updated": "修改项目",
  "catalog.item_deleted": "删除项目",
  "catalog.item_restored": "恢复项目",
  "catalog.items_reordered": "调整项目顺序",
  "commission.employee_default_changed": "修改员工默认提成",
  "commission.employee_item_changed": "修改员工项目提成",
  "shift.clocked_in": "上班打卡",
  "shift.clocked_out": "下班打卡",
  "shift.stale_auto_closed": "自动结束旧班次",
  "board.row_added": "加入今日表格",
  "board.row_updated": "修改今日表格员工行",
  "board.row_hidden": "隐藏今日表格员工行",
  "board.row_shown": "重新显示今日表格员工行",
  "board.rows_reordered": "调整员工顺序",
  "work_record.created": "新增记工",
  "work_record.created_with_custom_service": "新增自定义项目记工",
  "work_record.updated": "修改记工",
  "work_record.payment_confirmed": "确认付款",
  "work_record.deleted": "删除记工",
  "work_record.restored": "恢复记工",
  "cash_settlement.settled": "结清现金",
  "cash_settlement.settled_via_all": "一键结清现金",
  "cash_settlement.reopened": "取消现金结清",
  "cash_settlement.reopened_automatically": "修改记工后自动取消现金结清",
  "business_day.closed": "日结",
  "business_day.force_closed": "强制日结",
  "business_day.closing_cancelled": "取消日结",
  "payroll_settlement.created": "新增工资结算",
  "payroll_settlement.updated": "修改工资结算",
  "payroll_settlement.deleted": "删除工资结算",
  "payroll_settlement.restored": "恢复工资结算",
  "ai.preview_consumed": "确认并执行 AI 预览",
};

const entityText: Record<string, string> = {
  store: "店铺",
  store_membership: "店铺成员",
  store_join_request: "加入申请",
  service_item: "主要项目",
  addon_item: "额外项目",
  discount_item: "折扣项目",
  employee_commission_rule: "员工提成规则",
  shift: "上下班记录",
  daily_board: "营业日表格",
  daily_employee_row: "员工表格行",
  work_record: "记工记录",
  daily_cash_settlement: "现金结算",
  business_day_closing: "日结记录",
  payroll_settlement: "工资结算",
  ai_change_preview: "AI 变更预览",
};

function money(cents: number) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "USD" }).format(cents / 100);
}

function parseMoney(value: string, label: string) {
  if (!/^\d+(?:\.\d{0,2})?$/.test(value.trim())) throw new Error(`${label}格式不正确`);
  return Math.round(Number(value) * 100);
}

function parsePercent(value: string, label: string, nullable = false) {
  if (nullable && !value.trim()) return null;
  if (!/^\d+(?:\.\d{0,2})?$/.test(value.trim())) throw new Error(`${label}格式不正确`);
  const number = Number(value);
  if (number < 0 || number > 100) throw new Error(`${label}必须在 0% 到 100% 之间`);
  return Math.round(number * 100);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function ManagePageClient() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [membership, setMembership] = useState<MembershipSummary | null>(null);
  const [store, setStore] = useState<StoreDetails | null>(null);
  const [members, setMembers] = useState<StoreMember[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [deletedRecords, setDeletedRecords] = useState<DeletedWorkRecord[]>([]);
  const [tab, setTab] = useState<ManageTab>("store");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const canManage = membership?.role !== "EMPLOYEE";

  const loadAll = useCallback(async () => {
    const profile = await apiRequest<MeResponse>("/me");
    const requestedStore = new URL(window.location.href).searchParams.get("store");
    const selected = profile.memberships.find((item) => item.store.id === requestedStore)
      ?? profile.memberships.find((item) => item.store.id === window.localStorage.getItem("massage_note_store_id"))
      ?? profile.memberships[0];
    if (!selected) {
      window.location.replace("/");
      return;
    }
    setMe(profile);
    setMembership(selected);
    const [storeResult, catalogResult] = await Promise.all([
      apiRequest<StoreDetails>(`/stores/${selected.store.id}`),
      apiRequest<CatalogResponse>(`/stores/${selected.store.id}/catalog${selected.role === "EMPLOYEE" ? "" : "?includeDeleted=true"}`),
    ]);
    setStore(storeResult);
    setCatalog(catalogResult);
    if (selected.role !== "EMPLOYEE") {
      const [memberResult, requestResult, deletedResult] = await Promise.all([
        apiRequest<StoreMember[]>(`/stores/${selected.store.id}/members`),
        apiRequest<JoinRequest[]>(`/stores/${selected.store.id}/join-requests`),
        apiRequest<DeletedWorkRecord[]>(`/stores/${selected.store.id}/work-records/deleted`),
      ]);
      setMembers(memberResult);
      setRequests(requestResult);
      setDeletedRecords(deletedResult);
    }
  }, []);

  useEffect(() => {
    void loadAll().catch((caught) => {
      if ((caught as { status?: number }).status === 401) window.location.replace("/login");
      else setError(errorMessage(caught));
    }).finally(() => setLoading(false));
  }, [loadAll]);
  const realtimeState = useStoreRealtime(membership?.store.id, loadAll);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await action(); } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(false); }
  }

  if (loading || !me || !membership || !store || !catalog) {
    return <main className="center-page"><div className="loading-card"><span className="spinner" /><strong>{error || "正在加载管理设置…"}</strong></div></main>;
  }

  const tabs: Array<[ManageTab, string]> = canManage
    ? [["store", "店铺设置"], ["members", "成员管理"], ["catalog", "项目与提成"], ["recovery", "记工回收站"], ["audit", "审计记录"]]
    : [["store", "店铺信息"], ["catalog", "项目说明"]];

  return (
    <main className="app-shell manage-shell">
      <header className="topbar">
        <div><p className="eyebrow">{store.name}</p><h1>店铺设置</h1><p className="business-date">店铺代码 {store.storeCode} · 你的身份：{roleText[membership.role]} <span className={`sync-status ${realtimeState === "网络已断开" ? "offline" : ""}`}>{realtimeState}</span></p></div>
        <div className="topbar-actions"><a className="store-switcher header-link" href="/help">使用帮助</a><a className="store-switcher header-link" href="/">返回今日记工</a></div>
      </header>
      <nav className="section-tabs" aria-label="管理页面">{tabs.map(([value, label]) => <button type="button" key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>)}</nav>
      {error && <p className="form-error" role="alert">{error}</p>}
      {tab === "store" && <StorePanel store={store} membership={membership} members={members} busy={busy} run={run} reload={loadAll} />}
      {tab === "members" && canManage && <MembersPanel storeId={store.id} currentRole={membership.role} members={members} requests={requests} catalog={catalog} busy={busy} run={run} reload={loadAll} />}
      {tab === "catalog" && <CatalogPanel storeId={store.id} canManage={canManage} catalog={catalog} busy={busy} run={run} reload={loadAll} />}
      {tab === "recovery" && canManage && <RecoveryPanel storeId={store.id} records={deletedRecords} busy={busy} run={run} reload={loadAll} />}
      {tab === "audit" && canManage && <AuditPanel storeId={store.id} members={members} />}
      <AppNav active="manage" storeId={store.id} />
    </main>
  );
}

function RecoveryPanel({ storeId, records, busy, run, reload }: { storeId: string; records: DeletedWorkRecord[]; busy: boolean; run: (action: () => Promise<void>) => Promise<void>; reload: () => Promise<void> }) {
  return <section className="manage-section"><section className="manage-card"><div className="manage-heading"><div><p className="eyebrow">软删除记录</p><h2>记工回收站</h2></div><span className="status-chip">{records.length} 条</span></div><p className="field-help">恢复后会重新计入主表和财务；若该营业日已日结，请先到财务页面取消日结。</p>{records.length === 0 ? <p className="empty-state">目前没有已删除的记工记录。</p> : <div className="table-scroll"><table className="data-table"><thead><tr><th>营业日</th><th>员工</th><th>项目</th><th>开始时间</th><th>大费基数</th><th>删除时间</th><th>删除原因</th><th>操作</th></tr></thead><tbody>{records.map((record) => <tr key={record.id}><td>{record.businessDate.slice(0, 10)}</td><td>{record.employee.displayName}</td><td>{record.serviceSnapshot?.shortName ?? "自定义项目"}</td><td>{formatTime(record.startAt)}</td><td>{money(record.grossFeeBaseCents)}</td><td>{record.deletedAt ? formatTime(record.deletedAt) : "—"}</td><td>{record.deleteReason || "未填写"}</td><td><button className="primary-action compact" disabled={busy} type="button" onClick={() => { if (!window.confirm(`确认恢复 ${record.employee.displayName} 的这条记工吗？恢复后会重新计入财务。`)) return; void run(async () => { await apiRequest(`/stores/${storeId}/work-records/${record.id}/restore`, { method: "POST", idempotent: true, body: { version: record.version } }); await reload(); }); }}>恢复记工</button></td></tr>)}</tbody></table></div>}</section></section>;
}

function StorePanel({ store, membership, members, busy, run, reload }: { store: StoreDetails; membership: MembershipSummary; members: StoreMember[]; busy: boolean; run: (action: () => Promise<void>) => Promise<void>; reload: () => Promise<void> }) {
  const [name, setName] = useState(store.name);
  const [timezone, setTimezone] = useState(store.timezone);
  const [cutoff, setCutoff] = useState(store.businessCutoffLocal);
  const [commission, setCommission] = useState((store.globalCommissionBps / 100).toString());
  const [autoDiscountEnabled, setAutoDiscountEnabled] = useState(store.mondayThursdayAutoDiscountEnabled);
  const [autoDiscountThreshold, setAutoDiscountThreshold] = useState((store.mondayThursdayAutoDiscountThresholdCents / 100).toFixed(2));
  const [autoDiscountAmount, setAutoDiscountAmount] = useState((store.mondayThursdayAutoDiscountAmountCents / 100).toFixed(2));
  const [nextOwner, setNextOwner] = useState("");
  const canManage = membership.role !== "EMPLOYEE";
  return <section className="manage-section">
    <form className="manage-card" onSubmit={(event) => { event.preventDefault(); void run(async () => {
      const thresholdCents = autoDiscountThreshold.trim() ? parseMoney(autoDiscountThreshold, "自动折扣应用门槛") : 0;
      const amountCents = autoDiscountAmount.trim() ? parseMoney(autoDiscountAmount, "自动折扣额度") : 0;
      await apiRequest(`/stores/${store.id}`, { method: "PATCH", idempotent: true, body: {
        version: store.version,
        name,
        timezone,
        businessCutoffLocal: cutoff,
        globalCommissionBps: parsePercent(commission, "全店默认提成"),
        mondayThursdayAutoDiscountEnabled: autoDiscountEnabled,
        mondayThursdayAutoDiscountThresholdCents: thresholdCents,
        mondayThursdayAutoDiscountAmountCents: amountCents,
      } });
      await reload();
    }); }}>
      <div className="manage-heading"><div><p className="eyebrow">基础资料</p><h2>{canManage ? "店铺设置" : "店铺信息"}</h2></div><span className="status-chip">营业中</span></div>
      <div className="manage-form-grid"><label>店铺名称<input disabled={!canManage} required value={name} onChange={(event) => setName(event.target.value)} /></label><label>店铺代码<input disabled value={store.storeCode} /></label><label>时区<input disabled={!canManage} required value={timezone} onChange={(event) => setTimezone(event.target.value)} /></label><label>营业日截止<input disabled={!canManage} type="time" required value={cutoff} onChange={(event) => setCutoff(event.target.value)} /></label><label>全店默认提成（%）<input disabled={!canManage} inputMode="decimal" required value={commission} onChange={(event) => setCommission(event.target.value)} /></label><label>当前店主<input disabled value={store.ownerMembership?.displayName ?? "—"} /></label></div>
      <p className="field-help">提成优先顺序：员工项目专属比例 → 项目默认比例 → 员工默认比例 → 全店默认比例。历史记工始终使用保存时的快照。</p>
      <section className={`auto-discount-settings${autoDiscountEnabled ? " enabled" : ""}`}>
        <div className="auto-discount-heading"><div><strong>周一至周四自动折扣</strong><p>按记工所属营业日判断；达到折前大费门槛后自动添加。</p></div><label className="inline-check"><input type="checkbox" disabled={!canManage} checked={autoDiscountEnabled} onChange={(event) => setAutoDiscountEnabled(event.target.checked)} />开启</label></div>
        <div className="manage-form-grid auto-discount-fields"><label>大费满多少（美元）<input disabled={!canManage || !autoDiscountEnabled} required={autoDiscountEnabled} inputMode="decimal" placeholder="例如 100.00" value={autoDiscountThreshold} onChange={(event) => setAutoDiscountThreshold(event.target.value)} /></label><label>自动折扣额度（美元）<input disabled={!canManage || !autoDiscountEnabled} required={autoDiscountEnabled} inputMode="decimal" placeholder="例如 10.00" value={autoDiscountAmount} onChange={(event) => setAutoDiscountAmount(event.target.value)} /></label></div>
        <p className="field-help">自动折扣和普通折扣一起计入折扣总额，由店铺承担；员工大费工资仍按折扣前的项目和加项金额计算。</p>
      </section>
      {canManage && <button className="primary-action" disabled={busy} type="submit">保存店铺设置</button>}
    </form>
    {membership.role === "OWNER" && <section className="manage-card danger-zone"><div className="manage-heading"><div><p className="eyebrow">仅店主</p><h2>店主转移与删除店铺</h2></div></div><p className="field-help">转移后你会变为经理，新店主获得全部店主权限。删除店铺会让所有成员立即无法进入，但历史数据不会物理删除。</p><div className="inline-controls"><select value={nextOwner} onChange={(event) => setNextOwner(event.target.value)}><option value="">选择新店主</option>{members.filter((item) => item.id !== membership.id && item.status === "ACTIVE").map((item) => <option key={item.id} value={item.id}>{item.displayName}（{roleText[item.role]}）</option>)}</select><button className="secondary-action" type="button" disabled={busy || !nextOwner} onClick={() => { if (!window.confirm("确认把店主身份转移给所选成员吗？")) return; void run(async () => { await apiRequest(`/stores/${store.id}/owner-transfer`, { method: "POST", idempotent: true, body: { version: store.version, newOwnerMembershipId: nextOwner } }); await reload(); }); }}>转移店主身份</button><button className="danger-button" type="button" disabled={busy} onClick={() => { const answer = window.prompt(`请输入店铺名称“${store.name}”确认删除`); if (answer !== store.name) return; const reason = window.prompt("请填写删除店铺原因"); if (!reason?.trim()) return; void run(async () => { await apiRequest(`/stores/${store.id}`, { method: "DELETE", idempotent: true, body: { version: store.version, reason: reason.trim() } }); window.localStorage.removeItem("massage_note_store_id"); window.location.replace("/"); }); }}>删除店铺</button></div></section>}
  </section>;
}

function MembersPanel({ storeId, currentRole, members, requests, catalog, busy, run, reload }: { storeId: string; currentRole: MembershipSummary["role"]; members: StoreMember[]; requests: JoinRequest[]; catalog: CatalogResponse; busy: boolean; run: (action: () => Promise<void>) => Promise<void>; reload: () => Promise<void> }) {
  return <section className="manage-section">
    <section className="manage-card"><div className="manage-heading"><div><p className="eyebrow">待处理</p><h2>加入申请</h2></div><span className="status-chip">{requests.length} 个</span></div>{requests.length === 0 ? <p className="empty-state">目前没有待审批的加入申请。</p> : <div className="request-list">{requests.map((request) => <article key={request.id}><div><strong>{request.requestedDisplayName}</strong><span>账号姓名：{[request.user.firstName, request.user.lastName].filter(Boolean).join(" ") || "未填写"} · {formatTime(request.createdAt)}</span></div><div><button className="primary-action compact" disabled={busy} type="button" onClick={() => void run(async () => { await apiRequest(`/stores/${storeId}/join-requests/${request.id}/approve`, { method: "POST", body: { version: request.version, role: "EMPLOYEE", isServiceProvider: true } }); await reload(); })}>批准为员工</button><button className="secondary-action compact" disabled={busy} type="button" onClick={() => { const note = window.prompt("拒绝备注（可留空）"); if (note === null) return; void run(async () => { await apiRequest(`/stores/${storeId}/join-requests/${request.id}/reject`, { method: "POST", body: { version: request.version, ...(note.trim() ? { reviewNote: note.trim() } : {}) } }); await reload(); }); }}>拒绝</button></div></article>)}</div>}</section>
    <section className="manage-card"><div className="manage-heading"><div><p className="eyebrow">权限与记工</p><h2>成员列表</h2></div><span className="status-chip">{members.filter((item) => item.status === "ACTIVE").length} 人在职</span></div><div className="member-list">{members.map((member) => <MemberEditor key={`${member.id}-${member.version}`} storeId={storeId} member={member} currentRole={currentRole} catalog={catalog} busy={busy} run={run} reload={reload} />)}</div></section>
  </section>;
}

function MemberEditor({ storeId, member, currentRole, catalog, busy, run, reload }: { storeId: string; member: StoreMember; currentRole: MembershipSummary["role"]; catalog: CatalogResponse; busy: boolean; run: (action: () => Promise<void>) => Promise<void>; reload: () => Promise<void> }) {
  const [name, setName] = useState(member.displayName);
  const [role, setRole] = useState(member.role);
  const [provider, setProvider] = useState(member.isServiceProvider);
  const [defaultCommission, setDefaultCommission] = useState(member.defaultCommissionBps === null ? "" : (member.defaultCommissionBps / 100).toString());
  const [commissionOpen, setCommissionOpen] = useState(false);
  const [history, setHistory] = useState<CommissionHistoryResponse | null>(null);
  const isOwner = member.role === "OWNER";
  const active = member.status === "ACTIVE";

  async function saveMember() {
    if (role === "OWNER") throw new Error("店主身份只能通过店主转移流程修改");
    await apiRequest(`/stores/${storeId}/members/${member.id}`, { method: "PATCH", body: { version: member.version, displayName: name, role, isServiceProvider: provider } });
    await reload();
  }
  async function saveDefaultCommission() {
    await apiRequest(`/stores/${storeId}/members/${member.id}/commissions/default`, { method: "PUT", idempotent: true, body: { version: member.version, commissionBps: parsePercent(defaultCommission, "员工默认提成", true) } });
    await reload();
  }
  async function openCommission() {
    setCommissionOpen(true);
    setHistory(await apiRequest<CommissionHistoryResponse>(`/stores/${storeId}/members/${member.id}/commissions`));
  }
  return <article className={`member-card ${active ? "" : "inactive"}`}><header><div className="member-avatar">{member.displayName.slice(0, 1)}</div><div><strong>{member.displayName}</strong><span>{roleText[member.role]} · {active ? "在职" : "已离职/停用"}</span></div><em>{member.isServiceProvider ? "参与记工" : "不参与记工"}</em></header><div className="member-fields"><label>店内显示名<input disabled={!active || isOwner} value={name} onChange={(event) => setName(event.target.value)} /></label><label>角色<select disabled={!active || isOwner} value={role} onChange={(event) => setRole(event.target.value as "MANAGER" | "EMPLOYEE")}>
  {isOwner && <option value="OWNER">店主</option>}<option value="EMPLOYEE">员工</option><option value="MANAGER">经理</option></select></label><label className="check-field"><input disabled={!active || isOwner} type="checkbox" checked={provider} onChange={(event) => setProvider(event.target.checked)} />参与记工</label><label>员工默认提成（%）<input disabled={!active || isOwner} placeholder="留空则继续向下匹配" inputMode="decimal" value={defaultCommission} onChange={(event) => setDefaultCommission(event.target.value)} /></label></div><div className="member-actions">{active && !isOwner && <><button className="secondary-action compact" disabled={busy} type="button" onClick={() => void run(saveMember)}>保存成员资料</button><button className="secondary-action compact" disabled={busy} type="button" onClick={() => void run(saveDefaultCommission)}>保存默认提成</button><button className="table-action" type="button" onClick={() => void run(openCommission)}>项目专属提成</button><button className="table-action danger" disabled={busy} type="button" onClick={() => { const reason = window.prompt("请填写离职或停用原因"); if (!reason?.trim()) return; void run(async () => { await apiRequest(`/stores/${storeId}/members/${member.id}`, { method: "DELETE", body: { version: member.version, reason: reason.trim() } }); await reload(); }); }}>离职/停用</button></>}{!active && !isOwner && <button className="primary-action compact" disabled={busy} type="button" onClick={() => void run(async () => { await apiRequest(`/stores/${storeId}/members/${member.id}/restore`, { method: "POST", body: { version: member.version } }); await reload(); })}>恢复为在职成员</button>}{isOwner && <span className="field-help">店主资料和身份需通过店主转移流程修改。</span>}</div>{commissionOpen && <ItemCommissionPanel storeId={storeId} member={member} catalog={catalog} history={history} busy={busy} run={run} close={() => setCommissionOpen(false)} reload={reload} />}</article>;
}

function ItemCommissionPanel({ storeId, member, catalog, history, busy, run, close, reload }: { storeId: string; member: StoreMember; catalog: CatalogResponse; history: CommissionHistoryResponse | null; busy: boolean; run: (action: () => Promise<void>) => Promise<void>; close: () => void; reload: () => Promise<void> }) {
  const [itemKey, setItemKey] = useState("");
  const [percent, setPercent] = useState("");
  const activeHistory = history?.itemHistory.filter((item) => item.effectiveTo === null) ?? [];
  const itemName = (type: string, id: string) => type === "SERVICE" ? catalog.serviceItems.find((item) => item.id === id)?.shortName : catalog.addonItems.find((item) => item.id === id)?.shortName;
  return <div className="commission-panel"><div className="manage-heading"><div><h3>{member.displayName} 的项目专属提成</h3><p className="field-help">留空比例会清除该项目专属规则，并继续使用下一层规则。</p></div><button className="close-button" type="button" onClick={close}>关闭</button></div><div className="inline-controls"><select value={itemKey} onChange={(event) => setItemKey(event.target.value)}><option value="">选择主要或额外项目</option>{catalog.serviceItems.filter((item) => !item.deletedAt).map((item) => <option key={item.id} value={`SERVICE:${item.id}`}>主要：{item.shortName}</option>)}{catalog.addonItems.filter((item) => !item.deletedAt).map((item) => <option key={item.id} value={`ADDON:${item.id}`}>额外：{item.shortName}</option>)}</select><input aria-label="项目专属提成" placeholder="比例 %，留空为清除" value={percent} onChange={(event) => setPercent(event.target.value)} /><button className="primary-action compact" disabled={busy || !itemKey} type="button" onClick={() => void run(async () => { const [itemType, itemId] = itemKey.split(":") as ["SERVICE" | "ADDON", string]; await apiRequest(`/stores/${storeId}/members/${member.id}/commissions/item`, { method: "PUT", idempotent: true, body: { version: member.version, itemType, itemId, commissionBps: parsePercent(percent, "项目专属提成", true) } }); await reload(); close(); })}>保存规则</button></div><div className="commission-current">{!history ? <span>正在读取历史…</span> : activeHistory.length === 0 ? <span>暂无生效中的项目专属规则。</span> : activeHistory.map((item) => <span key={item.id}>{itemName(item.itemType, item.itemId) ?? "已删除项目"}：{item.commissionBps / 100}%</span>)}</div></div>;
}

interface PriceOptionDraft {
  key: string;
  duration: string;
  amount: string;
}

const newPriceOption = (duration = "60", amount = ""): PriceOptionDraft => ({
  key: crypto.randomUUID(),
  duration,
  amount,
});

function CatalogPanel({ storeId, canManage, catalog, busy, run, reload }: { storeId: string; canManage: boolean; catalog: CatalogResponse; busy: boolean; run: (action: () => Promise<void>) => Promise<void>; reload: () => Promise<void> }) {
  const active = [...catalog.serviceItems, ...catalog.addonItems, ...catalog.discountItems].filter((item) => !item.deletedAt && item.isEnabled).length;

  async function moveItem(type: CatalogKind, items: Array<ServiceItem | AddonItem | DiscountItem>, itemId: string, direction: -1 | 1) {
    const activeItems = items.filter((item) => !item.deletedAt);
    const index = activeItems.findIndex((item) => item.id === itemId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= activeItems.length) return;
    const reordered = [...activeItems];
    [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!];
    await apiRequest(`/stores/${storeId}/catalog/reorder`, {
      method: "POST",
      idempotent: true,
      body: { type, items: reordered.map((item) => ({ id: item.id, version: item.version })) },
    });
    await reload();
  }

  return <section className="manage-section"><section className="manage-card">
    <div className="manage-heading"><div><p className="eyebrow">价格与规则</p><h2>项目目录</h2></div><span className="status-chip">{active} 项启用</span></div>
    <p className="field-help">每类项目都可独立上移、下移；此顺序也会用于今日记工和详情选择框。新增窗口位于对应分类底部。</p>
    <CatalogGroup title="主要项目" type="SERVICE" items={catalog.serviceItems} emptyText="还没有主要项目。" storeId={storeId} canManage={canManage} busy={busy} run={run} reload={reload} moveItem={moveItem} />
    <CatalogGroup title="额外项目" type="ADDON" items={catalog.addonItems} emptyText="还没有额外项目。" storeId={storeId} canManage={canManage} busy={busy} run={run} reload={reload} moveItem={moveItem} />
    <CatalogGroup title="折扣项目" type="DISCOUNT" items={catalog.discountItems} emptyText="还没有折扣项目。" storeId={storeId} canManage={canManage} busy={busy} run={run} reload={reload} moveItem={moveItem} />
  </section></section>;
}

function CatalogGroup({ title, type, items, emptyText, storeId, canManage, busy, run, reload, moveItem }: { title: string; type: CatalogKind; items: Array<ServiceItem | AddonItem | DiscountItem>; emptyText: string; storeId: string; canManage: boolean; busy: boolean; run: (action: () => Promise<void>) => Promise<void>; reload: () => Promise<void>; moveItem: (type: CatalogKind, items: Array<ServiceItem | AddonItem | DiscountItem>, itemId: string, direction: -1 | 1) => Promise<void> }) {
  const activeItems = items.filter((item) => !item.deletedAt);
  return <section className="catalog-group">
    <div className="catalog-group-heading"><div><p className="eyebrow">独立维护</p><h3>{title}</h3></div><span>{activeItems.length} 项</span></div>
    <div className="catalog-list">{items.length ? items.map((item) => {
      const activeIndex = activeItems.findIndex((candidate) => candidate.id === item.id);
      return <CatalogItemEditor key={`${item.id}-${item.version}`} storeId={storeId} type={type} item={item} canManage={canManage} busy={busy} run={run} reload={reload} canMoveUp={activeIndex > 0} canMoveDown={activeIndex >= 0 && activeIndex < activeItems.length - 1} onMove={(direction) => run(() => moveItem(type, items, item.id, direction))} />;
    }) : <p className="empty-state">{emptyText}</p>}</div>
    {canManage && <CatalogCreateForm storeId={storeId} kind={type} busy={busy} run={run} reload={reload} />}
  </section>;
}

function CatalogCreateForm({ storeId, kind, busy, run, reload }: { storeId: string; kind: CatalogKind; busy: boolean; run: (action: () => Promise<void>) => Promise<void>; reload: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [amount, setAmount] = useState("");
  const [duration, setDuration] = useState("");
  const [priceOptions, setPriceOptions] = useState<PriceOptionDraft[]>([newPriceOption()]);
  const [commission, setCommission] = useState("");
  const label = kind === "SERVICE" ? "主要项目" : kind === "ADDON" ? "额外项目" : "折扣项目";
  const updatePriceOption = (key: string, changes: Partial<PriceOptionDraft>) => setPriceOptions((current) => current.map((option) => option.key === key ? { ...option, ...changes } : option));
  return <form className="catalog-create catalog-create--group" onSubmit={(event) => { event.preventDefault(); void run(async () => {
    const body = kind === "SERVICE"
      ? { type: kind, fullName: name, shortName, priceOptions: priceOptions.map((option) => ({ durationMinutes: Number(option.duration), priceCents: parseMoney(option.amount, `${option.duration} 分钟价格`) })) }
      : kind === "ADDON"
        ? { type: kind, name, shortName, amountCents: parseMoney(amount, "项目金额"), durationMinutes: duration.trim() ? Number(duration) : null }
        : { type: kind, name, shortName, amountCents: parseMoney(amount, "折扣金额") };
    if (kind !== "DISCOUNT" && commission.trim()) Object.assign(body, { defaultCommissionBps: parsePercent(commission, "项目默认提成") });
    await apiRequest(`/stores/${storeId}/catalog/items`, { method: "POST", idempotent: true, body });
    setName(""); setShortName(""); setAmount(""); setDuration(""); setCommission(""); setPriceOptions([newPriceOption()]);
    await reload();
  }); }}>
    <h4>新增{label}</h4>
    <input required aria-label={`${label}名称`} placeholder={kind === "SERVICE" ? "项目全名，例如 Body Massage" : "项目名称"} value={name} onChange={(event) => setName(event.target.value)} />
    <input required aria-label={`${label}简称`} maxLength={30} placeholder="简称" value={shortName} onChange={(event) => setShortName(event.target.value)} />
    {kind === "SERVICE" ? <div className="catalog-price-options-edit"><strong>时长与价格</strong>{priceOptions.map((option, index) => <div className="catalog-price-option-row" key={option.key}>
      <input required type="number" min="1" max="720" inputMode="numeric" aria-label={`第 ${index + 1} 个时长`} placeholder="分钟" value={option.duration} onChange={(event) => updatePriceOption(option.key, { duration: event.target.value })} />
      <input required inputMode="decimal" aria-label={`第 ${index + 1} 个价格`} placeholder="价格（美元）" value={option.amount} onChange={(event) => updatePriceOption(option.key, { amount: event.target.value })} />
      {priceOptions.length > 1 && <button className="danger-link" type="button" onClick={() => setPriceOptions((current) => current.filter((candidate) => candidate.key !== option.key))}>移除</button>}
    </div>)}<button className="secondary-action compact" type="button" onClick={() => setPriceOptions((current) => [...current, newPriceOption("")])}>＋ 添加时长价格</button></div> : <input required aria-label={`${label}金额`} inputMode="decimal" placeholder={kind === "DISCOUNT" ? "折扣美元" : "金额美元"} value={amount} onChange={(event) => setAmount(event.target.value)} />}
    {kind === "ADDON" && <input aria-label="额外项目分钟" inputMode="numeric" placeholder="分钟（可留空）" value={duration} onChange={(event) => setDuration(event.target.value)} />}
    {kind !== "DISCOUNT" && <input aria-label={`${label}默认提成`} inputMode="decimal" placeholder="默认提成 %（可留空）" value={commission} onChange={(event) => setCommission(event.target.value)} />}
    <button className="primary-action compact" disabled={busy} type="submit">新增{label}</button>
  </form>;
}

function CatalogItemEditor({ storeId, type, item, canManage, busy, run, reload, canMoveUp, canMoveDown, onMove }: { storeId: string; type: CatalogKind; item: ServiceItem | AddonItem | DiscountItem; canManage: boolean; busy: boolean; run: (action: () => Promise<void>) => Promise<void>; reload: () => Promise<void>; canMoveUp: boolean; canMoveDown: boolean; onMove: (direction: -1 | 1) => Promise<void> }) {
  const service = type === "SERVICE" ? item as ServiceItem : null;
  const addon = type === "ADDON" ? item as AddonItem : null;
  const discount = type === "DISCOUNT" ? item as DiscountItem : null;
  const [name, setName] = useState(service?.fullName ?? addon?.name ?? discount?.name ?? "");
  const [shortName, setShortName] = useState(item.shortName);
  const [amount, setAmount] = useState(((addon?.amountCents ?? discount?.amountCents ?? 0) / 100).toFixed(2));
  const [duration, setDuration] = useState((addon?.durationMinutes ?? "").toString());
  const [priceOptions, setPriceOptions] = useState<PriceOptionDraft[]>(
    service?.priceOptions.map((option) => newPriceOption(option.durationMinutes.toString(), (option.priceCents / 100).toFixed(2))) ?? [],
  );
  const [commission, setCommission] = useState(service?.defaultCommissionBps === null || addon?.defaultCommissionBps === null ? "" : ((service?.defaultCommissionBps ?? addon?.defaultCommissionBps ?? 0) / 100).toString());
  const deleted = Boolean(item.deletedAt);
  const amountCents = addon?.amountCents ?? discount?.amountCents ?? 0;
  const updatePriceOption = (key: string, changes: Partial<PriceOptionDraft>) => setPriceOptions((current) => current.map((option) => option.key === key ? { ...option, ...changes } : option));

  return <article className={`catalog-item ${deleted ? "deleted" : ""}`}>
    <div className="catalog-summary">
      <strong>{shortName}</strong><span>{name}</span>
      {service ? <div className="catalog-price-summary">{service.priceOptions.map((option) => <em key={option.id}>{option.durationMinutes} 分钟 · {money(option.priceCents)}</em>)}</div> : <em>{type === "DISCOUNT" ? `-${money(amountCents)}` : money(amountCents)}</em>}
      <small>{type !== "DISCOUNT" ? (commission ? `默认提成 ${commission}%` : "无项目默认提成") : "折扣项目"}</small>
      <small>{deleted ? "已删除，可恢复" : item.isEnabled ? "启用中" : "已停用"}</small>
    </div>
    {canManage && !deleted && <div className="catalog-edit-fields">
      <div className="catalog-order-actions" aria-label={`${item.shortName}排序`}><button className="secondary-action compact" disabled={busy || !canMoveUp} type="button" onClick={() => void onMove(-1)}>↑ 上移</button><button className="secondary-action compact" disabled={busy || !canMoveDown} type="button" onClick={() => void onMove(1)}>↓ 下移</button></div>
      <input aria-label={`${item.shortName}名称`} value={name} onChange={(event) => setName(event.target.value)} />
      <input aria-label={`${item.shortName}简称`} value={shortName} onChange={(event) => setShortName(event.target.value)} />
      {service ? <div className="catalog-price-options-edit">
        <strong>时长与价格</strong>
        {priceOptions.map((option, index) => <div className="catalog-price-option-row" key={option.key}>
          <input type="number" min="1" max="720" inputMode="numeric" aria-label={`${item.shortName}第 ${index + 1} 个时长`} value={option.duration} onChange={(event) => updatePriceOption(option.key, { duration: event.target.value })} />
          <input inputMode="decimal" aria-label={`${item.shortName}第 ${index + 1} 个价格`} value={option.amount} onChange={(event) => updatePriceOption(option.key, { amount: event.target.value })} />
          {priceOptions.length > 1 && <button className="danger-link" type="button" onClick={() => setPriceOptions((current) => current.filter((candidate) => candidate.key !== option.key))}>移除</button>}
        </div>)}
        <button className="secondary-action compact" type="button" onClick={() => setPriceOptions((current) => [...current, newPriceOption("")])}>＋ 添加时长价格</button>
      </div> : <input aria-label={`${item.shortName}金额`} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />}
      {addon && <input aria-label={`${item.shortName}分钟`} inputMode="numeric" value={duration} onChange={(event) => setDuration(event.target.value)} />}
      {type !== "DISCOUNT" && <input aria-label={`${item.shortName}提成`} inputMode="decimal" placeholder="默认提成 %" value={commission} onChange={(event) => setCommission(event.target.value)} />}
      <button className="secondary-action compact" disabled={busy} type="button" onClick={() => void run(async () => {
        const body = service
          ? { type, version: item.version, fullName: name, shortName, priceOptions: priceOptions.map((option) => ({ durationMinutes: Number(option.duration), priceCents: parseMoney(option.amount, `${option.duration} 分钟价格`) })), defaultCommissionBps: parsePercent(commission, "项目默认提成", true) }
          : addon
            ? { type, version: item.version, name, shortName, amountCents: parseMoney(amount, "项目金额"), durationMinutes: duration.trim() ? Number(duration) : null, defaultCommissionBps: parsePercent(commission, "项目默认提成", true) }
            : { type, version: item.version, name, shortName, amountCents: parseMoney(amount, "折扣金额") };
        await apiRequest(`/stores/${storeId}/catalog/items/${item.id}`, { method: "PATCH", idempotent: true, body });
        await reload();
      })}>保存</button>
      <button className="table-action danger" disabled={busy} type="button" onClick={() => { const reason = window.prompt("请填写删除项目原因"); if (!reason?.trim()) return; void run(async () => { await apiRequest(`/stores/${storeId}/catalog/items/${item.id}`, { method: "DELETE", idempotent: true, body: { type, version: item.version, reason: reason.trim() } }); await reload(); }); }}>删除</button>
    </div>}
    {canManage && deleted && <button className="primary-action compact" disabled={busy} type="button" onClick={() => void run(async () => { await apiRequest(`/stores/${storeId}/catalog/items/${item.id}/restore`, { method: "POST", idempotent: true, body: { type, version: item.version } }); await reload(); })}>恢复项目</button>}
  </article>;
}

function AuditPanel({ storeId, members }: { storeId: string; members: StoreMember[] }) {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [entityType, setEntityType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const params = useMemo(() => { const value = new URLSearchParams({ limit: "30" }); if (action) value.set("action", action); if (actor) value.set("actorMembershipId", actor); if (entityType) value.set("entityType", entityType); if (dateFrom) value.set("dateFrom", dateFrom); if (dateTo) value.set("dateTo", dateTo); return value; }, [action, actor, entityType, dateFrom, dateTo]);
  const load = useCallback(async (append = false) => { setLoading(true); setError(""); try { const query = new URLSearchParams(params); if (append && cursor) query.set("cursor", cursor); const page = await apiRequest<AuditLogPage>(`/stores/${storeId}/audit-logs?${query}`); setItems((current) => append ? [...current, ...page.items] : page.items); setCursor(page.nextCursor); } catch (caught) { setError(errorMessage(caught)); } finally { setLoading(false); } }, [storeId, params, cursor]);
  useEffect(() => { void load(false); }, [params]); // eslint-disable-line react-hooks/exhaustive-deps
  return <section className="manage-section"><section className="manage-card"><div className="manage-heading"><div><p className="eyebrow">不可篡改的操作历史</p><h2>审计记录</h2></div></div><div className="audit-filters"><label>开始营业日<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label>结束营业日<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label><label>操作类型<select value={action} onChange={(event) => setAction(event.target.value)}><option value="">全部操作</option>{Object.entries(actionText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>对象类型<select value={entityType} onChange={(event) => setEntityType(event.target.value)}><option value="">全部对象</option>{Object.entries(entityText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>操作人<select value={actor} onChange={(event) => setActor(event.target.value)}><option value="">全部成员</option>{members.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label><button className="secondary-action compact" type="button" disabled={loading} onClick={() => void load(false)}>刷新</button></div>{error && <p className="form-error">{error}</p>}<div className="audit-list">{items.map((item) => <article key={item.id}><button type="button" onClick={() => setExpanded((current) => current === item.id ? null : item.id)}><span className="audit-icon">记</span><div><strong>{actionText[item.action] ?? "其他系统操作"}</strong><span>{item.actor?.displayName ?? "系统"} · {formatTime(item.createdAt)}{item.businessDate ? ` · 营业日 ${item.businessDate.slice(0, 10)}` : ""}</span></div><em>{expanded === item.id ? "收起" : "详情"}</em></button>{expanded === item.id && <div className="audit-detail"><p>对象：{entityText[item.entityType] ?? "其他对象"} · 记录编号 {item.entityId}</p>{item.reason && <p>原因：{item.reason}</p>}<div><section><strong>修改前</strong><pre>{item.beforeJson ? JSON.stringify(item.beforeJson, null, 2) : "无"}</pre></section><section><strong>修改后</strong><pre>{item.afterJson ? JSON.stringify(item.afterJson, null, 2) : "无"}</pre></section></div></div>}</article>)}{!loading && items.length === 0 && <p className="empty-state">没有符合条件的审计记录。</p>}</div>{loading && <p className="empty-state">正在读取审计记录…</p>}{cursor && <button className="secondary-action" disabled={loading} type="button" onClick={() => void load(true)}>加载更多</button>}</section></section>;
}
