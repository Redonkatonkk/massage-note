"use client";

import { useAutoDismissState } from "../use-auto-dismiss-state";

import { browserStorage } from "../../lib/browser-storage";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiRequest, errorMessage } from "../../lib/api";
import { formatMoneyInput, formatUsd } from "../../lib/money";
import type {
  AddonItem,
  AuditLogItem,
  AuditLogPage,
  CatalogResponse,
  DiscountItem,
  DeletedGiftCardSale,
  DeletedWorkRecord,
  JoinRequest,
  MeResponse,
  MembershipSummary,
  ServiceItem,
  StoreDetails,
  StoreMember,
  WorkBotSettings,
} from "../../lib/types";
import { useStoreRealtime } from "../../lib/realtime";
import { isWorkRecordChange } from "../../lib/realtime-scope";
import { AppNav } from "../app-nav";
import { useLanguage } from "../language-provider";
import { WorkBotPanel } from "./work-bot-panel";
import { RecoveryPanel } from "./recovery-panel";
import { AuditDetails } from "./audit-details";
import { UiIcon } from "../ui/primitives";
import { MembersPanel } from "./members-panel";
import { manageNavigationTabs, resolveManageTab, type ManageTab } from "../../lib/app-navigation";
import { useNavigationTab } from "../use-navigation-tab";

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
  "membership.created_unclaimed": "创建待注册员工",
  "membership.account_claimed": "员工账号自动关联",
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
  "board.rows_ranked": "生成今日员工顺序",
  "work_record.created": "新增记工",
  "work_record.created_with_custom_service": "新增自定义项目记工",
  "work_record.updated": "修改记工",
  "work_record.commission_refreshed": "按最新提成重算当日记工",
  "work_record.payment_confirmed": "确认付款",
  "work_record.deleted": "删除记工",
  "work_record.restored": "恢复记工",
  "gift_card.sale_created": "新增礼物卡销售",
  "gift_card.sale_updated": "修改礼物卡销售",
  "gift_card.sale_deleted": "删除礼物卡销售",
  "gift_card.sale_restored": "恢复礼物卡销售",
  "cash_settlement.settled": "结清现金",
  "cash_settlement.settled_via_all": "一键结清现金",
  "cash_settlement.reopened": "取消现金结清",
  "cash_settlement.reopened_automatically": "修改记工后自动取消现金结清",
  "business_day.closed": "日结",
  "business_day.force_closed": "强制日结",
  "business_day.closing_cancelled": "取消日结",
  "employee_closing.delivery_queued": "排队发送员工小结",
  "employee_closing.delivery_sent": "已发送员工小结",
  "employee_closing.delivery_cancelled": "已取消员工小结发送",
  "employee_closing.delivery_rejected": "员工小结发送任务无效",
  "closing_delivery.agent_credential_rotated": "更新 Mac 信息代理令牌",
  "closing_delivery.agent_credential_revoked": "撤销 Mac 信息代理令牌",
  "expense.created": "新增店铺支出",
  "expense.updated": "修改店铺支出",
  "expense.rule_changed": "变更支出周期规则",
  "expense.stopped": "停止周期支出",
  "expense.period_recorded": "填写实际支出账单",
  "expense.period_cleared": "撤销支出账单覆盖",
  "expense.deleted": "删除店铺支出",
  "expense.restored": "恢复店铺支出",
  "payroll_settlement.created": "新增工资结算",
  "payroll_settlement.updated": "修改工资结算",
  "payroll_settlement.deleted": "删除工资结算",
  "payroll_settlement.restored": "恢复工资结算",
  "ai.preview_consumed": "确认并执行 AI 预览",
  "work_bot.group_bound": "绑定记工群",
  "work_bot.group_unbound": "解除记工群",
  "work_bot.member_bound": "绑定群成员",
  "work_bot.member_unbound": "解除群成员",
  "work_bot.alias_created": "新增记工黑话",
  "work_bot.alias_updated": "修改记工黑话",
  "work_bot.alias_deleted": "删除记工黑话",
  "work_bot.work_started": "机器人上工",
  "work_bot.work_finished": "机器人下工",
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
  gift_card_sale: "礼物卡销售",
  daily_cash_settlement: "现金结算",
  business_day_closing: "日结记录",
  employee_closing_delivery: "员工小结发送",
  closing_delivery_agent: "Mac 信息代理",
  expense_item: "店铺支出",
  payroll_settlement: "工资结算",
  ai_change_preview: "AI 变更预览",
  work_bot_group_binding: "记工群绑定",
  work_bot_member_binding: "记工员工绑定",
  work_bot_alias: "记工黑话",
};

function money(cents: number) {
  return formatUsd(cents);
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
  const { t } = useLanguage();
  const [memberDirty, setMemberDirty] = useState(false);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [membership, setMembership] = useState<MembershipSummary | null>(null);
  const [store, setStore] = useState<StoreDetails | null>(null);
  const [members, setMembers] = useState<StoreMember[]>([]);
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [deletedRecords, setDeletedRecords] = useState<DeletedWorkRecord[]>([]);
  const [deletedGiftCardSales, setDeletedGiftCardSales] = useState<DeletedGiftCardSale[]>([]);
  const [workBot, setWorkBot] = useState<WorkBotSettings | null>(null);
  const [tab, setTab] = useState<ManageTab>("store");
  const selectTab = useNavigationTab(membership?.role, resolveManageTab, setTab);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useAutoDismissState("");

  const canManage = membership?.role !== "EMPLOYEE";

  const loadAll = useCallback(async () => {
    const profile = await apiRequest<MeResponse>("/me");
    const requestedStore = new URL(window.location.href).searchParams.get("store");
    const selected = profile.memberships.find((item) => item.store.id === requestedStore)
      ?? profile.memberships.find((item) => item.store.id === browserStorage.getItem("massage_note_store_id"))
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
      const [memberResult, requestResult, deletedResult, deletedGiftCardResult, workBotResult] = await Promise.all([
        apiRequest<StoreMember[]>(`/stores/${selected.store.id}/members`),
        apiRequest<JoinRequest[]>(`/stores/${selected.store.id}/join-requests`),
        apiRequest<DeletedWorkRecord[]>(`/stores/${selected.store.id}/work-records/deleted`),
        apiRequest<DeletedGiftCardSale[]>(`/stores/${selected.store.id}/gift-card-sales/deleted`),
        apiRequest<WorkBotSettings>(`/stores/${selected.store.id}/work-bot`),
      ]);
      setMembers(memberResult);
      setRequests(requestResult);
      setDeletedRecords(deletedResult);
      setDeletedGiftCardSales(deletedGiftCardResult);
      setWorkBot(workBotResult);
    }
  }, []);

  useEffect(() => {
    void loadAll().catch((caught) => {
      if ((caught as { status?: number }).status === 401) window.location.replace("/login");
      else setError(errorMessage(caught));
    }).finally(() => setLoading(false));
  }, [loadAll]);
  const realtimeState = useStoreRealtime(membership?.store.id, async change => {
    if (isWorkRecordChange(change) && membership) {
      if (canManage) setDeletedRecords(await apiRequest<DeletedWorkRecord[]>(`/stores/${membership.store.id}/work-records/deleted`));
      return;
    }
    await loadAll();
  });

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try { await action(); } catch (caught) { setError(errorMessage(caught)); } finally { setBusy(false); }
  }

  if (loading || !me || !membership || !store || !catalog) {
    if (!loading) return <main className="center-page"><section className="error-card"><h1>暂时无法读取管理设置</h1>{error && <p role="alert">{error}</p>}<button className="primary-action" type="button" onClick={() => window.location.reload()}>重新加载</button></section></main>;
    return <main className="center-page"><div className="loading-card"><span className="spinner" /><strong>正在加载管理设置…</strong></div></main>;
  }

  const tabs = manageNavigationTabs(membership.role);
  const pageDescriptions: Record<ManageTab, string> = {
    store: canManage ? "维护门店资料、营业规则和发送设备。" : "查看门店资料与当前营业规则。",
    members: "从员工名册进入档案，统一管理权限、工资和日结。",
    catalog: "维护服务价格、加项与折扣，历史账目保留原有快照。",
    "work-bot": "设置群内用语，核对绑定身份与机器人操作。",
    recovery: "核对删除原因，按需恢复记工与礼物卡销售。",
    audit: "按时间、成员和操作查找店铺的变更记录。",
  };
  function changeTab(value: string) {
    if (value === tab) return;
    if (memberDirty && !window.confirm(t("有未保存的修改，确认放弃吗？"))) return;
    setMemberDirty(false); selectTab(value);
  }

  return (
    <main className="app-shell manage-shell">
      <header className="topbar">
        <div><p className="eyebrow">{store.name}</p><h1>{tabs.find(([value]) => value === tab)?.[1]}</h1><p className="business-date">{pageDescriptions[tab]} <span className={`sync-status ${realtimeState === "网络已断开" ? "offline" : ""}`}>{realtimeState}</span></p></div>
        <div className="topbar-actions"><a className="store-switcher header-link" href="/help">使用帮助</a><a className="store-switcher header-link" href="/">返回今日记工</a></div>
      </header>
      <nav className="section-tabs" aria-label="管理页面">{tabs.map(([value, label]) => <button type="button" key={value} className={tab === value ? "active" : ""} aria-pressed={tab === value} onClick={() => changeTab(value)}>{label}</button>)}</nav>
      {error && <p className="form-error" role="alert">{error}</p>}
      {tab === "store" && <StorePanel store={store} membership={membership} members={members} busy={busy} run={run} reload={loadAll} />}
      {tab === "members" && canManage && <MembersPanel key={store.id} storeId={store.id} dailyRankingEnabled={store.automaticDispatchEnabled} members={members} requests={requests} catalog={catalog} busy={busy} run={run} reload={loadAll} onDirtyChange={setMemberDirty} />}
      {tab === "catalog" && <CatalogPanel storeId={store.id} canManage={canManage} catalog={catalog} busy={busy} run={run} reload={loadAll} />}
      {tab === "work-bot" && canManage && workBot && <WorkBotPanel key={store.id} storeId={store.id} catalog={catalog} settings={workBot} busy={busy} run={run} reload={loadAll} />}
      {tab === "recovery" && canManage && <RecoveryPanel storeId={store.id} records={deletedRecords} giftCardSales={deletedGiftCardSales} busy={busy} run={run} reload={loadAll} />}
      {tab === "audit" && canManage && <AuditPanel storeId={store.id} members={members} />}
      <AppNav active="manage" storeId={store.id} role={membership.role} activeTab={tab} onTabChange={changeTab} />
    </main>
  );
}


function StorePanel({ store, membership, members, busy, run, reload }: { store: StoreDetails; membership: MembershipSummary; members: StoreMember[]; busy: boolean; run: (action: () => Promise<void>) => Promise<void>; reload: () => Promise<void> }) {
  const [name, setName] = useState(store.name);
  const [timezone, setTimezone] = useState(store.timezone);
  const [commission, setCommission] = useState((store.globalCommissionBps / 100).toString());
  const [autoDiscountEnabled, setAutoDiscountEnabled] = useState(store.mondayThursdayAutoDiscountEnabled);
  const [autoDiscountThreshold, setAutoDiscountThreshold] = useState(formatMoneyInput(store.mondayThursdayAutoDiscountThresholdCents));
  const [autoDiscountAmount, setAutoDiscountAmount] = useState(formatMoneyInput(store.mondayThursdayAutoDiscountAmountCents));
  const [giftCardDiscountEnabled, setGiftCardDiscountEnabled] = useState(store.giftCardAutoDiscountEnabled);
  const [giftCardDiscountThreshold, setGiftCardDiscountThreshold] = useState(formatMoneyInput(store.giftCardAutoDiscountThresholdCents));
  const [giftCardDiscountPercent, setGiftCardDiscountPercent] = useState((store.giftCardAutoDiscountBps / 100).toString());
  const [closingDefaultLocale, setClosingDefaultLocale] = useState(store.closingDefaultLocale);
  const [automaticDispatchEnabled, setAutomaticDispatchEnabled] = useState(store.automaticDispatchEnabled);
  const [agentStatus, setAgentStatus] = useState<null | { tokenPrefix: string; lastSeenAt: string | null; revokedAt: string | null; lastStatusJson?: { messagesAvailable?: boolean; serviceTypes?: string[]; lastError?: string | null } | null }>(null);
  const [agentToken, setAgentToken] = useState("");
  const [nextOwner, setNextOwner] = useState("");
  const [saved, setSaved] = useAutoDismissState(false);
  const canManage = membership.role !== "EMPLOYEE";

  useEffect(() => {
    if (!canManage) return;
    void apiRequest<typeof agentStatus>(`/stores/${store.id}/closing-delivery-agent/status`).then(setAgentStatus).catch(() => undefined);
  }, [canManage, store.id]);

  useEffect(() => {
    setSaved(false);
  }, [name, timezone, commission, autoDiscountEnabled, autoDiscountThreshold, autoDiscountAmount, giftCardDiscountEnabled, giftCardDiscountThreshold, giftCardDiscountPercent, closingDefaultLocale, automaticDispatchEnabled]);

  return <section className="manage-section store-settings-layout">
    <form className="manage-card" onSubmit={(event) => { event.preventDefault(); setSaved(false); void run(async () => {
      const thresholdCents = autoDiscountThreshold.trim() ? parseMoney(autoDiscountThreshold, "自动折扣应用门槛") : 0;
      const amountCents = autoDiscountAmount.trim() ? parseMoney(autoDiscountAmount, "自动折扣额度") : 0;
      const giftCardThresholdCents = giftCardDiscountEnabled ? parseMoney(giftCardDiscountThreshold, "礼物卡自动折扣门槛") : 0;
      const giftCardDiscountBps = giftCardDiscountEnabled ? parsePercent(giftCardDiscountPercent, "礼物卡自动折扣") : 0;
      await apiRequest(`/stores/${store.id}`, { method: "PATCH", idempotent: true, body: {
        version: store.version,
        name,
        timezone,
        globalCommissionBps: parsePercent(commission, "全店默认提成"),
        mondayThursdayAutoDiscountEnabled: autoDiscountEnabled,
        mondayThursdayAutoDiscountThresholdCents: thresholdCents,
        mondayThursdayAutoDiscountAmountCents: amountCents,
        giftCardAutoDiscountEnabled: giftCardDiscountEnabled,
        giftCardAutoDiscountThresholdCents: giftCardThresholdCents,
        giftCardAutoDiscountBps: giftCardDiscountBps,
        closingDefaultLocale,
        automaticDispatchEnabled,
      } });
      await reload();
      setSaved(true);
    }); }}>
      <div className="manage-heading"><div><p className="eyebrow">基础资料</p><h2>{canManage ? "店铺设置" : "店铺信息"}</h2></div><span className="status-chip">营业中</span></div>
      <div className="manage-form-grid"><label>店铺名称<input disabled={!canManage} required value={name} onChange={(event) => setName(event.target.value)} /></label><label>店铺代码<input disabled value={store.storeCode} /></label><label>时区<input disabled={!canManage} required value={timezone} onChange={(event) => setTimezone(event.target.value)} /></label><label>全店默认提成（%）<input disabled={!canManage} inputMode="decimal" required value={commission} onChange={(event) => setCommission(event.target.value)} /></label><label>个人日结默认语言<select disabled={!canManage} value={closingDefaultLocale} onChange={(event) => setClosingDefaultLocale(event.target.value as "zh_CN" | "en_US")}><option value="zh_CN">中文</option><option value="en_US">English</option></select></label><label>当前店主<input disabled value={store.ownerMembership?.displayName ?? "—"} /></label></div>
      <p className="field-help">提成优先顺序：员工项目专属比例 → 员工默认比例 → 项目默认比例 → 全店默认比例。保存员工提成后会重算未日结的当前营业日；已日结和历史记工继续使用原快照。</p>
      <section className={`auto-discount-settings${automaticDispatchEnabled ? " enabled" : ""}`}>
        <div className="auto-discount-heading"><div><strong>每日开门排位</strong><p>按员工最近一次出勤的最终名次，生成今天的员工顺序。</p></div><label className="inline-check"><input type="checkbox" disabled={!canManage} checked={automaticDispatchEnabled} onChange={(event) => setAutomaticDispatchEnabled(event.target.checked)} />开启</label></div>
        <p className="field-help">开启前必须先在成员管理中为所有参与记工的在职人员设置全职或兼职。本功能只排列员工顺序，不管理每个工。</p>
      </section>
      <section className={`auto-discount-settings${autoDiscountEnabled ? " enabled" : ""}`}>
        <div className="auto-discount-heading"><div><strong>周一至周四自动折扣</strong><p>按记工所属营业日判断；非高亮记工达到折前大费门槛后自动添加。</p></div><label className="inline-check"><input type="checkbox" disabled={!canManage} checked={autoDiscountEnabled} onChange={(event) => setAutoDiscountEnabled(event.target.checked)} />开启</label></div>
        <div className="manage-form-grid auto-discount-fields"><label>大费满多少（美元）<input disabled={!canManage || !autoDiscountEnabled} required={autoDiscountEnabled} inputMode="decimal" placeholder="例如 100" value={autoDiscountThreshold} onChange={(event) => setAutoDiscountThreshold(event.target.value)} /></label><label>自动折扣额度（美元）<input disabled={!canManage || !autoDiscountEnabled} required={autoDiscountEnabled} inputMode="decimal" placeholder="例如 10" value={autoDiscountAmount} onChange={(event) => setAutoDiscountAmount(event.target.value)} /></label></div>
        <p className="field-help">自动折扣和普通折扣一起计入折扣总额，由店铺承担；员工大费工资仍按折扣前的项目和加项金额计算。</p>
      </section>
      <section className={`auto-discount-settings${giftCardDiscountEnabled ? " enabled" : ""}`}>
        <div className="auto-discount-heading"><div><strong>礼物卡自动折扣</strong><p>卖卡达到面值门槛后，自动按比例计算折扣和客人应付金额。</p></div><label className="inline-check"><input type="checkbox" disabled={!canManage} checked={giftCardDiscountEnabled} onChange={(event) => setGiftCardDiscountEnabled(event.target.checked)} />开启</label></div>
        <div className="manage-form-grid auto-discount-fields"><label>礼物卡满多少（美元）<input disabled={!canManage || !giftCardDiscountEnabled} required={giftCardDiscountEnabled} inputMode="decimal" placeholder="例如 100" value={giftCardDiscountThreshold} onChange={(event) => setGiftCardDiscountThreshold(event.target.value)} /></label><label>自动折扣（%）<input disabled={!canManage || !giftCardDiscountEnabled} required={giftCardDiscountEnabled} inputMode="decimal" placeholder="例如 5" value={giftCardDiscountPercent} onChange={(event) => setGiftCardDiscountPercent(event.target.value)} /></label></div>
        <p className="field-help">例如设置“满 $100、折扣 5%”，录入 $100 面值礼物卡时，系统会要求现金和刷卡合计为 $95。历史记录保留售出时的折扣规则快照。</p>
      </section>
      {saved && <p className="success-banner manage-save-success" role="status">✓ 店铺设置已保存</p>}
      {canManage && <button className="primary-action" disabled={busy} type="submit">{busy ? "正在保存…" : "保存店铺设置"}</button>}
    </form>
    {canManage && <section className="manage-card"><div className="manage-heading"><div><p className="eyebrow">Mac 信息代理</p><h2>员工小结发送设备</h2></div><span className={`status-chip ${agentStatus?.lastSeenAt && Date.now() - new Date(agentStatus.lastSeenAt).getTime() < 180_000 ? "" : "warning"}`}>{agentStatus?.revokedAt ? "已撤销" : agentStatus?.lastSeenAt ? "最近在线" : "未连接"}</span></div><p className="field-help">代理令牌只在生成时显示一次。请在固定 Mac 上安装 messages-agent，并允许它控制“信息”App。</p>{agentStatus?.lastSeenAt && <p className="field-help">最后在线：{formatTime(agentStatus.lastSeenAt)} · 服务：{agentStatus.lastStatusJson?.serviceTypes?.join(" / ") || "未报告"}{agentStatus.lastStatusJson?.lastError ? ` · ${agentStatus.lastStatusJson.lastError}` : ""}</p>}{agentToken && <label>新代理令牌（请立即复制）<input readOnly value={agentToken} onFocus={(event) => event.currentTarget.select()} /></label>}<div className="inline-controls"><button className="primary-action compact" type="button" disabled={busy} onClick={() => void run(async () => { const result = await apiRequest<{ token: string; tokenPrefix: string }>(`/stores/${store.id}/closing-delivery-agent/credential`, { method: "POST" }); setAgentToken(result.token); setAgentStatus({ tokenPrefix: result.tokenPrefix, lastSeenAt: null, revokedAt: null }); })}>{agentStatus ? "轮换代理令牌" : "生成代理令牌"}</button>{agentStatus && !agentStatus.revokedAt && <button className="secondary-action compact" type="button" disabled={busy} onClick={() => void run(async () => { await apiRequest(`/stores/${store.id}/closing-delivery-agent/credential`, { method: "DELETE" }); setAgentStatus((current) => current ? { ...current, revokedAt: new Date().toISOString() } : current); setAgentToken(""); })}>撤销代理</button>}</div></section>}
    {membership.role === "OWNER" && <section className="manage-card danger-zone"><div className="manage-heading"><div><p className="eyebrow">仅店主</p><h2>店主转移与删除店铺</h2></div></div><p className="field-help">转移后你会变为经理，新店主获得全部店主权限。删除店铺会让所有成员立即无法进入，但历史数据不会物理删除。</p><div className="inline-controls"><select value={nextOwner} onChange={(event) => setNextOwner(event.target.value)}><option value="">选择新店主</option>{members.filter((item) => item.id !== membership.id && item.status === "ACTIVE" && Boolean(item.user)).map((item) => <option key={item.id} value={item.id}>{item.displayName}（{roleText[item.role]}）</option>)}</select><button className="secondary-action" type="button" disabled={busy || !nextOwner} onClick={() => { if (!window.confirm("确认把店主身份转移给所选成员吗？")) return; void run(async () => { await apiRequest(`/stores/${store.id}/owner-transfer`, { method: "POST", idempotent: true, body: { version: store.version, newOwnerMembershipId: nextOwner } }); await reload(); }); }}>转移店主身份</button><button className="danger-button" type="button" disabled={busy} onClick={() => { const answer = window.prompt(`请输入店铺名称“${store.name}”确认删除`); if (answer !== store.name) return; const reason = window.prompt("请填写删除店铺原因"); if (!reason?.trim()) return; void run(async () => { await apiRequest(`/stores/${store.id}`, { method: "DELETE", idempotent: true, body: { version: store.version, reason: reason.trim() } }); browserStorage.removeItem("massage_note_store_id"); window.location.replace("/"); }); }}>删除店铺</button></div></section>}
  </section>;
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
    <p className="field-help">按分类维护服务。调整项目顺序后，今日记工与详情选择框会同步采用新顺序。</p>
    <CatalogGroup title="主要项目" description="一个项目可维护多组时长与价格，快速记工会沿用这里的顺序。" type="SERVICE" items={catalog.serviceItems} emptyText="还没有主要项目。" storeId={storeId} canManage={canManage} busy={busy} run={run} reload={reload} moveItem={moveItem} />
    <CatalogGroup title="额外项目" description="维护热石等服务加项的金额、时长与默认提成。" type="ADDON" items={catalog.addonItems} emptyText="还没有额外项目。" storeId={storeId} canManage={canManage} busy={busy} run={run} reload={reload} moveItem={moveItem} />
    <CatalogGroup title="折扣项目" description="可设置固定金额或百分比折扣；折扣由店铺承担，不会降低员工项目提成。" type="DISCOUNT" items={catalog.discountItems} emptyText="还没有折扣项目。" storeId={storeId} canManage={canManage} busy={busy} run={run} reload={reload} moveItem={moveItem} />
  </section></section>;
}

function CatalogGroup({ title, description, type, items, emptyText, storeId, canManage, busy, run, reload, moveItem }: { title: string; description: string; type: CatalogKind; items: Array<ServiceItem | AddonItem | DiscountItem>; emptyText: string; storeId: string; canManage: boolean; busy: boolean; run: (action: () => Promise<void>) => Promise<void>; reload: () => Promise<void>; moveItem: (type: CatalogKind, items: Array<ServiceItem | AddonItem | DiscountItem>, itemId: string, direction: -1 | 1) => Promise<void> }) {
  const [showCreate, setShowCreate] = useState(false);
  const activeItems = items.filter((item) => !item.deletedAt);
  const enabledItems = activeItems.filter((item) => item.isEnabled);
  return <section className="catalog-group">
    <div className="catalog-group-heading">
      <div className="catalog-group-title"><p className="eyebrow">独立维护</p><h3>{title}</h3><p>{description}</p></div>
      <div className="catalog-group-tools">
        <span>{`${enabledItems.length} 项启用 · ${activeItems.length} 项`}</span>
        {canManage && <button className="secondary-action compact catalog-add-toggle" type="button" aria-expanded={showCreate} onClick={() => setShowCreate((current) => !current)}>{showCreate ? "收起新增" : `＋ 新增${title}`}</button>}
      </div>
    </div>
    {canManage && showCreate && <CatalogCreateForm storeId={storeId} kind={type} busy={busy} run={run} reload={reload} onCreated={() => setShowCreate(false)} />}
    <div className="catalog-list">{items.length ? items.map((item) => {
      const activeIndex = activeItems.findIndex((candidate) => candidate.id === item.id);
      return <CatalogItemEditor key={`${item.id}-${item.version}`} storeId={storeId} type={type} item={item} canManage={canManage} busy={busy} run={run} reload={reload} canMoveUp={activeIndex > 0} canMoveDown={activeIndex >= 0 && activeIndex < activeItems.length - 1} onMove={(direction) => run(() => moveItem(type, items, item.id, direction))} />;
    }) : <p className="empty-state">{emptyText}</p>}</div>
  </section>;
}

function CatalogCreateForm({ storeId, kind, busy, run, reload, onCreated }: { storeId: string; kind: CatalogKind; busy: boolean; run: (action: () => Promise<void>) => Promise<void>; reload: () => Promise<void>; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [amount, setAmount] = useState("");
  const [percentage, setPercentage] = useState(false);
  const [duration, setDuration] = useState("");
  const [priceOptions, setPriceOptions] = useState<PriceOptionDraft[]>([newPriceOption()]);
  const [commission, setCommission] = useState("");
  const label = kind === "SERVICE" ? "主要项目" : kind === "ADDON" ? "额外项目" : "折扣项目";
  const updatePriceOption = (key: string, changes: Partial<PriceOptionDraft>) => setPriceOptions((current) => current.map((option) => option.key === key ? { ...option, ...changes } : option));
  return <form className={`catalog-create catalog-create--${kind.toLowerCase()}`} onSubmit={(event) => { event.preventDefault(); void run(async () => {
    const body = kind === "SERVICE"
      ? { type: kind, fullName: name, shortName, priceOptions: priceOptions.map((option) => ({ durationMinutes: Number(option.duration), priceCents: parseMoney(option.amount, `${option.duration} 分钟价格`) })) }
      : kind === "ADDON"
        ? { type: kind, name, shortName, amountCents: parseMoney(amount, "项目金额"), durationMinutes: duration.trim() ? Number(duration) : null }
        : { type: kind, name, shortName, amountCents: percentage ? 0 : parseMoney(amount, "折扣金额"), ...(percentage ? { rateBps: parsePercent(amount, "折扣比例") } : {}) };
    if (kind !== "DISCOUNT" && commission.trim()) Object.assign(body, { defaultCommissionBps: parsePercent(commission, "项目默认提成") });
    await apiRequest(`/stores/${storeId}/catalog/items`, { method: "POST", idempotent: true, body });
    setName(""); setShortName(""); setAmount(""); setDuration(""); setCommission(""); setPercentage(false); setPriceOptions([newPriceOption()]);
    await reload();
    onCreated();
  }); }}>
    <div className="catalog-create-heading"><div><p className="eyebrow">新增</p><h4>{`新增${label}`}</h4></div><button className="close-button" type="button" onClick={onCreated}>关闭</button></div>
    <label className="catalog-field catalog-field--name"><span>{kind === "SERVICE" ? "项目全名" : "名称"}</span><input required aria-label={`${label}名称`} placeholder={kind === "SERVICE" ? "例如 Body Massage" : "填写名称"} value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label className="catalog-field catalog-field--short-name"><span>简称</span><input required aria-label={`${label}简称`} maxLength={30} placeholder="记工卡片上显示" value={shortName} onChange={(event) => setShortName(event.target.value)} /></label>
    {kind === "SERVICE" ? <div className="catalog-field catalog-field--price-options catalog-price-options-edit"><span>时长与价格</span>{priceOptions.map((option, index) => <div className="catalog-price-option-row" key={option.key}>
      <input required type="number" min="1" max="720" inputMode="numeric" aria-label={`第 ${index + 1} 个时长`} placeholder="分钟" value={option.duration} onChange={(event) => updatePriceOption(option.key, { duration: event.target.value })} />
      <input required inputMode="decimal" aria-label={`第 ${index + 1} 个价格`} placeholder="价格（美元）" value={option.amount} onChange={(event) => updatePriceOption(option.key, { amount: event.target.value })} />
      {priceOptions.length > 1 && <button className="danger-link" type="button" onClick={() => setPriceOptions((current) => current.filter((candidate) => candidate.key !== option.key))}>移除</button>}
    </div>)}<button className="secondary-action compact" type="button" onClick={() => setPriceOptions((current) => [...current, newPriceOption("")])}>＋ 添加时长价格</button></div> : <>{kind === "DISCOUNT" && <label className="catalog-field"><span>折扣类型</span><select value={percentage ? "percentage" : "fixed"} onChange={(event) => setPercentage(event.target.value === "percentage")}><option value="fixed">固定金额</option><option value="percentage">按百分比</option></select></label>}<label className="catalog-field catalog-field--amount"><span>{kind === "DISCOUNT" ? percentage ? "折扣比例（%）" : "折扣金额（美元）" : "金额（美元）"}</span><input required aria-label={`${label}${percentage ? "比例" : "金额"}`} inputMode="decimal" placeholder={percentage ? "例如 10" : "0.00"} value={amount} onChange={(event) => setAmount(event.target.value)} /></label></>}
    {kind === "ADDON" && <label className="catalog-field catalog-field--duration"><span>时间（分钟）</span><input aria-label="额外项目分钟" inputMode="numeric" placeholder="可留空" value={duration} onChange={(event) => setDuration(event.target.value)} /></label>}
    {kind !== "DISCOUNT" && <label className="catalog-field catalog-field--commission"><span>默认提成（%）</span><input aria-label={`${label}默认提成`} inputMode="decimal" placeholder="可留空" value={commission} onChange={(event) => setCommission(event.target.value)} /></label>}
    <div className="catalog-form-actions"><button className="primary-action compact" disabled={busy} type="submit">{`新增${label}`}</button></div>
  </form>;
}

function CatalogItemEditor({ storeId, type, item, canManage, busy, run, reload, canMoveUp, canMoveDown, onMove }: { storeId: string; type: CatalogKind; item: ServiceItem | AddonItem | DiscountItem; canManage: boolean; busy: boolean; run: (action: () => Promise<void>) => Promise<void>; reload: () => Promise<void>; canMoveUp: boolean; canMoveDown: boolean; onMove: (direction: -1 | 1) => Promise<void> }) {
  const service = type === "SERVICE" ? item as ServiceItem : null;
  const addon = type === "ADDON" ? item as AddonItem : null;
  const discount = type === "DISCOUNT" ? item as DiscountItem : null;
  const [name, setName] = useState(service?.fullName ?? addon?.name ?? discount?.name ?? "");
  const [shortName, setShortName] = useState(item.shortName);
  const [amount, setAmount] = useState(discount?.rateBps != null ? (discount.rateBps / 100).toString() : formatMoneyInput(addon?.amountCents ?? discount?.amountCents ?? 0));
  const [percentage, setPercentage] = useState(discount?.rateBps != null);
  const [duration, setDuration] = useState((addon?.durationMinutes ?? "").toString());
  const [priceOptions, setPriceOptions] = useState<PriceOptionDraft[]>(
    service?.priceOptions.map((option) => newPriceOption(option.durationMinutes.toString(), formatMoneyInput(option.priceCents))) ?? [],
  );
  const savedCommission = service?.defaultCommissionBps === null || addon?.defaultCommissionBps === null ? "" : ((service?.defaultCommissionBps ?? addon?.defaultCommissionBps ?? 0) / 100).toString();
  const [commission, setCommission] = useState(savedCommission);
  const [isEnabled, setIsEnabled] = useState(item.isEnabled);
  const [editing, setEditing] = useState(false);
  const deleted = Boolean(item.deletedAt);
  const amountCents = addon?.amountCents ?? discount?.amountCents ?? 0;
  const updatePriceOption = (key: string, changes: Partial<PriceOptionDraft>) => setPriceOptions((current) => current.map((option) => option.key === key ? { ...option, ...changes } : option));

  function cancelEditing() {
    setName(service?.fullName ?? addon?.name ?? discount?.name ?? "");
    setShortName(item.shortName);
    setPercentage(discount?.rateBps != null);
    setAmount(discount?.rateBps != null ? (discount.rateBps / 100).toString() : formatMoneyInput(addon?.amountCents ?? discount?.amountCents ?? 0));
    setDuration((addon?.durationMinutes ?? "").toString());
    setPriceOptions(service?.priceOptions.map((option) => newPriceOption(option.durationMinutes.toString(), formatMoneyInput(option.priceCents))) ?? []);
    setCommission(savedCommission);
    setIsEnabled(item.isEnabled);
    setEditing(false);
  }

  return <article className={`catalog-item catalog-item--${type.toLowerCase()} ${deleted ? "deleted" : ""}`}>
    <div className="catalog-item-heading">
      <div className="catalog-summary">
        <div className="catalog-summary-title"><strong>{item.shortName}</strong><span>{service?.fullName ?? addon?.name ?? discount?.name}</span></div>
        <div className="catalog-summary-facts">
          {service ? service.priceOptions.map((option) => <em key={option.id}>{option.durationMinutes} 分钟 · {money(option.priceCents)}</em>) : <em>{type === "DISCOUNT" ? discount?.rateBps != null ? `-${discount.rateBps / 100}%` : `-${money(amountCents)}` : money(amountCents)}</em>}
          {addon && <em>{addon.durationMinutes === null ? "不增加时长" : `${addon.durationMinutes} 分钟`}</em>}
          {type !== "DISCOUNT" && <em>{savedCommission ? `默认提成 ${savedCommission}%` : "无项目默认提成"}</em>}
          <small className={deleted || !item.isEnabled ? "inactive" : ""}>{deleted ? "已删除，可恢复" : item.isEnabled ? "启用中" : "已停用"}</small>
        </div>
      </div>
      <div className="catalog-item-actions">
        {canManage && !deleted && <div className="catalog-order-actions" aria-label={`${item.shortName}排序`}><button className="secondary-action compact" disabled={busy || !canMoveUp} type="button" onClick={() => void onMove(-1)}>↑ 上移</button><button className="secondary-action compact" disabled={busy || !canMoveDown} type="button" onClick={() => void onMove(1)}>↓ 下移</button></div>}
        {canManage && !deleted && <button className="secondary-action compact" type="button" aria-expanded={editing} onClick={() => editing ? cancelEditing() : setEditing(true)}>{editing ? "收起" : "修改"}</button>}
        {canManage && deleted && <button className="primary-action compact" disabled={busy} type="button" onClick={() => void run(async () => { await apiRequest(`/stores/${storeId}/catalog/items/${item.id}/restore`, { method: "POST", idempotent: true, body: { type, version: item.version } }); await reload(); })}>恢复项目</button>}
      </div>
    </div>
    {canManage && !deleted && editing && <div className={`catalog-edit-panel catalog-edit-panel--${type.toLowerCase()}`}>
      <label className="catalog-field catalog-field--name"><span>{service ? "项目全名" : "名称"}</span><input aria-label={`${item.shortName}名称`} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label className="catalog-field catalog-field--short-name"><span>简称</span><input aria-label={`${item.shortName}简称`} value={shortName} onChange={(event) => setShortName(event.target.value)} /></label>
      {service ? <div className="catalog-field catalog-field--price-options catalog-price-options-edit">
        <span>时长与价格</span>
        {priceOptions.map((option, index) => <div className="catalog-price-option-row" key={option.key}>
          <input type="number" min="1" max="720" inputMode="numeric" aria-label={`${item.shortName}第 ${index + 1} 个时长`} value={option.duration} onChange={(event) => updatePriceOption(option.key, { duration: event.target.value })} />
          <input inputMode="decimal" aria-label={`${item.shortName}第 ${index + 1} 个价格`} value={option.amount} onChange={(event) => updatePriceOption(option.key, { amount: event.target.value })} />
          {priceOptions.length > 1 && <button className="danger-link" type="button" onClick={() => setPriceOptions((current) => current.filter((candidate) => candidate.key !== option.key))}>移除</button>}
        </div>)}
        <button className="secondary-action compact" type="button" onClick={() => setPriceOptions((current) => [...current, newPriceOption("")])}>＋ 添加时长价格</button>
      </div> : <>{discount && <label className="catalog-field"><span>折扣类型</span><select value={percentage ? "percentage" : "fixed"} onChange={(event) => setPercentage(event.target.value === "percentage")}><option value="fixed">固定金额</option><option value="percentage">按百分比</option></select></label>}<label className="catalog-field catalog-field--amount"><span>{discount ? percentage ? "折扣比例（%）" : "折扣金额（美元）" : "金额（美元）"}</span><input aria-label={`${item.shortName}${percentage ? "比例" : "金额"}`} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label></>}
      {addon && <label className="catalog-field catalog-field--duration"><span>时间（分钟）</span><input aria-label={`${item.shortName}分钟`} inputMode="numeric" placeholder="可留空" value={duration} onChange={(event) => setDuration(event.target.value)} /></label>}
      {type !== "DISCOUNT" && <label className="catalog-field catalog-field--commission"><span>默认提成（%）</span><input aria-label={`${item.shortName}提成`} inputMode="decimal" placeholder="可留空" value={commission} onChange={(event) => setCommission(event.target.value)} /></label>}
      <label className="catalog-enabled-toggle"><input type="checkbox" checked={isEnabled} onChange={(event) => setIsEnabled(event.target.checked)} /><span>启用</span></label>
      <div className="catalog-form-actions"><button className="primary-action compact" disabled={busy} type="button" onClick={() => void run(async () => {
        const body = service
          ? { type, version: item.version, fullName: name, shortName, priceOptions: priceOptions.map((option) => ({ durationMinutes: Number(option.duration), priceCents: parseMoney(option.amount, `${option.duration} 分钟价格`) })), defaultCommissionBps: parsePercent(commission, "项目默认提成", true), isEnabled }
          : addon
            ? { type, version: item.version, name, shortName, amountCents: parseMoney(amount, "项目金额"), durationMinutes: duration.trim() ? Number(duration) : null, defaultCommissionBps: parsePercent(commission, "项目默认提成", true), isEnabled }
            : { type, version: item.version, name, shortName, amountCents: percentage ? 0 : parseMoney(amount, "折扣金额"), rateBps: percentage ? parsePercent(amount, "折扣比例") : null, isEnabled };
        await apiRequest(`/stores/${storeId}/catalog/items/${item.id}`, { method: "PATCH", idempotent: true, body });
        await reload();
      })}>保存修改</button><button className="secondary-action compact" disabled={busy} type="button" onClick={cancelEditing}>取消</button><button className="table-action danger" disabled={busy} type="button" onClick={() => { const reason = window.prompt("请填写删除项目原因"); if (!reason?.trim()) return; void run(async () => { await apiRequest(`/stores/${storeId}/catalog/items/${item.id}`, { method: "DELETE", idempotent: true, body: { type, version: item.version, reason: reason.trim() } }); await reload(); }); }}>删除</button></div>
    </div>}
  </article>;
}

function AuditPanel({ storeId, members }: { storeId: string; members: StoreMember[] }) {
  const [items, setItems] = useState<AuditLogItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useAutoDismissState("");
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [entityType, setEntityType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const params = useMemo(() => { const value = new URLSearchParams({ limit: "30" }); if (action) value.set("action", action); if (actor) value.set("actorMembershipId", actor); if (entityType) value.set("entityType", entityType); if (dateFrom) value.set("dateFrom", dateFrom); if (dateTo) value.set("dateTo", dateTo); return value; }, [action, actor, entityType, dateFrom, dateTo]);
  const load = useCallback(async (append = false) => { setLoading(true); setError(""); try { const query = new URLSearchParams(params); if (append && cursor) query.set("cursor", cursor); const page = await apiRequest<AuditLogPage>(`/stores/${storeId}/audit-logs?${query}`); setItems((current) => append ? [...current, ...page.items] : page.items); setCursor(page.nextCursor); } catch (caught) { setError(errorMessage(caught)); } finally { setLoading(false); } }, [storeId, params, cursor]);
  useEffect(() => { void load(false); }, [params]); // eslint-disable-line react-hooks/exhaustive-deps
  return <section className="manage-section"><section className="manage-card"><div className="manage-heading"><div><p className="eyebrow">不可篡改的操作历史</p><h2>审计记录</h2></div></div><div className="audit-filters"><label>开始营业日<input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></label><label>结束营业日<input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></label><label>操作类型<select value={action} onChange={(event) => setAction(event.target.value)}><option value="">全部操作</option>{Object.entries(actionText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>对象类型<select value={entityType} onChange={(event) => setEntityType(event.target.value)}><option value="">全部对象</option>{Object.entries(entityText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>操作人<select value={actor} onChange={(event) => setActor(event.target.value)}><option value="">全部成员</option>{members.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label><button className="secondary-action compact" type="button" disabled={loading} onClick={() => void load(false)}>刷新</button></div>{error && <p className="form-error">{error}</p>}<div className="audit-list">{items.map((item) => <article key={item.id}><button type="button" aria-expanded={expanded === item.id} onClick={() => setExpanded((current) => current === item.id ? null : item.id)}><span className="audit-icon" aria-hidden="true"><UiIcon name="log" /></span><div><strong>{actionText[item.action] ?? "其他系统操作"}</strong><span>{item.actor?.displayName ?? "系统"} · {formatTime(item.createdAt)}{item.businessDate ? ` · 营业日 ${item.businessDate.slice(0, 10)}` : ""}</span></div><em>{expanded === item.id ? "收起" : "详情"}</em></button>{expanded === item.id && <AuditDetails item={item} entityLabel={entityText[item.entityType] ?? "其他对象"} /> }</article>)}{!loading && items.length === 0 && <p className="empty-state">没有符合条件的审计记录。</p>}</div>{loading && <p className="empty-state">正在读取审计记录…</p>}{cursor && <button className="secondary-action" disabled={loading} type="button" onClick={() => void load(true)}>加载更多</button>}</section></section>;
}
