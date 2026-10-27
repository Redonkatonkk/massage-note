"use client";

import { useAutoDismissState } from "./use-auto-dismiss-state";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ApiError, apiRequest, errorMessage } from "../lib/api";
import {
  canShowEmployeeClockIn,
  canViewEmployeeTotals,
  compactPaymentAmount,
  discountBadgeText,
  recordPaymentDisplay,
  recordTrackItems,
  serviceRecordCount,
} from "../lib/board";
import { homeClosingAction } from "../lib/closing";
import {
  canGenerateDailyRanking,
  dailyRankingActionLabel,
} from "../lib/daily-ranking";
import { financeClosingHref } from "../lib/navigation";
import { formatUsd, formatUsdPrecise } from "../lib/money";
import { useLanguage } from "./language-provider";
import { newWorkRecord } from "../lib/new-work-record";
import { hasConfirmedPaymentMismatch } from "../lib/record-payment";
import { businessTimeToIso, currentStoreTime, displayTime } from "../lib/time";
import { activeWorkRecord } from "../lib/work-status";
import type {
  BoardResponse,
  CatalogResponse,
  ClosingPreview,
  ClosingDeliveryItem,
  ClosingDeliveryList,
  CurrentBusinessDay,
  MembershipSummary,
  StoreDetails,
  StoreMember,
  WorkRecord,
} from "../lib/types";
import { ClosingDeliveryQueueButton } from "./closing-delivery-queue";
import { EmployeeClosingModal } from "./employee-closing";
import { LostCustomers } from "./lost-customers";
import { GiftCardSales } from "./gift-card-sales";
import { WorkTimeInput } from "./work-time-input";
import { RankingExplanationButton } from "./ranking-explanation";
import { BoardWeeklyDispatch } from "./board-weekly-dispatch";
import { BoardEmployeePicker } from "./board-employee-picker";
import { RecordTrack } from "./record-track";
import { RecordEditor } from "./record-editor";
import { PlaceholderDeleteDialog } from "./placeholder-delete-dialog";
import { AutoCloseDetails } from "./auto-close-details";
import { OverviewMetric, UiIcon } from "./ui/primitives";

interface TodayBoardProps {
  wideLayout: boolean;
  heading: ReactNode;
  accountActions: ReactNode;
  dateControls: ReactNode;
  returnToToday: ReactNode;
  calendar: ReactNode;
  loadError: string;
  membership: MembershipSummary;
  store: StoreDetails;
  currentDay: CurrentBusinessDay;
  isCurrentBusinessDay: boolean;
  isFutureBusinessDay: boolean;
  board: BoardResponse;
  catalog: CatalogResponse;
  members: StoreMember[];
  initialRecordId?: string | undefined;
  onInitialRecordOpened?: () => void;
  onReload: () => Promise<void>;
}

function money(cents: number | null): string {
  return cents === null ? "未填写" : formatUsd(cents);
}

function CashChangeMetric({ cents }: { cents: number | null }) {
  const { locale } = useLanguage();
  const value = cents == null ? "—" : `${cents > 0 ? "+" : cents < 0 ? "-" : ""}${formatUsdPrecise(Math.abs(cents), locale)}`;
  return <OverviewMetric icon="wallet" label="现金变化" value={value}
    title="现金大费实收＋卖卡现金实收－员工应发现金；店长经理不扣工资，现金小费不计入，按日结时保存的应发金额计算。"
    note={cents == null ? "旧日结未记录，重新日结后生成" : "正数增加，负数减少"} />;
}

function PaymentBreakdown({
  status,
  cashCents,
  cardCents,
  giftCardCents,
  zeroLabel = "金额为 0",
}: {
  status: Exclude<WorkRecord["status"], "PLACEHOLDER">;
  cashCents: number | null;
  cardCents: number | null;
  giftCardCents: number | null;
  zeroLabel?: string;
}) {
  const display = recordPaymentDisplay({ status, cashCents, cardCents, giftCardCents });
  if (display.kind === "PENDING") return <span className="record-payment-empty">待填写</span>;
  if (display.kind === "ZERO") return <span className="record-payment-empty">{zeroLabel}</span>;

  return <span className="record-payment-breakdown">
    {display.parts.map((part, index) => {
      const amount = compactPaymentAmount(part.cents);
      const methodLabel = part.method === "CARD" ? "刷卡" : part.method === "CASH" ? "现金" : "礼物卡";
      return <span className="record-payment-group" key={part.method}>
        {index > 0 && <span className="record-payment-plus" aria-hidden="true">+</span>}
        <span
          className={`record-payment-amount record-payment-amount--${part.method.toLowerCase().replace("_", "-")}`}
          aria-label={`${methodLabel} ${amount} 美元`}
          title={methodLabel}
        >
          {part.method === "GIFT_CARD" && <small>礼卡</small>}
          {amount}
        </span>
      </span>;
    })}
  </span>;
}

export function TodayBoard({
  wideLayout,
  heading,
  accountActions,
  dateControls,
  returnToToday,
  calendar,
  loadError,
  membership,
  store,
  currentDay,
  isCurrentBusinessDay,
  isFutureBusinessDay,
  board,
  catalog,
  members,
  initialRecordId,
  onInitialRecordOpened,
  onReload,
}: TodayBoardProps) {
  const canManage = membership.role !== "EMPLOYEE";
  const canChangeRowVisibility = canManage && (!board.isClosed || (!isCurrentBusinessDay && !isFutureBusinessDay));
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [quickEmployeeId, setQuickEmployeeId] = useState<string | null>(null);
  const [quickHighlighted, setQuickHighlighted] = useState(false);
  const [quickDispatchExcluded, setQuickDispatchExcluded] = useState(false);
  const [startTimeValid, setStartTimeValid] = useState(true);
  const [startTime, setStartTime] = useState(currentStoreTime(currentDay.timezone));
  const [creatingRecord, setCreatingRecord] = useState<WorkRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<WorkRecord | null>(null);
  const [deletingPlaceholder, setDeletingPlaceholder] = useState<WorkRecord | null>(null);
  const [closingEmployee, setClosingEmployee] = useState<{ id: string; displayName: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const actionInFlight = useRef(false);
  const [error, setError] = useAutoDismissState("");
  const [notice, setNotice] = useAutoDismissState("");
  const [deliveryList, setDeliveryList] = useState<ClosingDeliveryList | null>(null);
  const [statusNow, setStatusNow] = useState(() => {
    const serverTime = Date.parse(currentDay.serverTime);
    return Number.isFinite(serverTime) ? serverTime : Date.now();
  });

  useEffect(() => {
    if (!canManage) { setDeliveryList(null); return; }
    const load = () => void apiRequest<ClosingDeliveryList>(`/stores/${membership.store.id}/closings/${currentDay.businessDate}/deliveries`).then(setDeliveryList).catch(() => undefined);
    load();
    const timer = window.setInterval(load, 15_000);
    return () => window.clearInterval(timer);
  }, [board.isClosed, canManage, currentDay.businessDate, membership.store.id]);

  useEffect(() => {
    if (!initialRecordId) return;
    const row = board.rows.find((candidate) =>
      candidate.workRecords.some((record) => record.id === initialRecordId),
    );
    const record = row?.workRecords.find((candidate) => candidate.id === initialRecordId);
    if (row && record) {
      setCollapsed((current) => current.filter((id) => id !== row.id));
      if (row.isHidden) setShowHidden(true);
      if (record.status === "PLACEHOLDER") setDeletingPlaceholder(record);
      else setEditingRecord(record);
    } else {
      setError("没有找到这条异常记工，记录可能已被删除或不属于当前店铺。");
    }
    onInitialRecordOpened?.();
  }, [board.rows, initialRecordId, onInitialRecordOpened]);

  useEffect(() => {
    if (!quickEmployeeId) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, [quickEmployeeId]);

  useEffect(() => {
    const serverTime = Date.parse(currentDay.serverTime);
    const serverStart = Number.isFinite(serverTime) ? serverTime : Date.now();
    const clientStart = Date.now();
    setStatusNow(serverStart);
    if (!isCurrentBusinessDay) return;
    const timer = window.setInterval(() => {
      setStatusNow(serverStart + Date.now() - clientStart);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [currentDay.serverTime, isCurrentBusinessDay]);

  const quickDurations = useMemo(() => [...new Set(catalog.serviceItems
    .filter((service) => service.isEnabled && !service.deletedAt)
    .flatMap((service) => service.priceOptions.map((option) => option.durationMinutes)))]
    .sort((a, b) => a - b), [catalog.serviceItems]);

  const visibleRows = useMemo(
    () => board.rows.filter((row) => !row.isHidden || !canManage || showHidden),
    [board.rows, canManage, showHidden],
  );
  const hiddenRows = useMemo(
    () => canManage ? board.rows.filter((row) => row.isHidden) : [],
    [board.rows, canManage],
  );
  const activeRowCount = board.rows.filter((row) => !row.isHidden).length;
  const canGenerateRanking = canGenerateDailyRanking({
    canManage,
    enabled: board.ranking.enabled,
    isFutureBusinessDay,
    isCurrentBusinessDay,
    isClosed: board.isClosed,
    activeRowCount,
  });
  const availableMembers = members.filter(
    (member) =>
      member.status === "ACTIVE" &&
      member.isServiceProvider &&
      !board.rows.some((row) => row.membershipId === member.id),
  );
  const showEmployeeClockIn = canShowEmployeeClockIn({
    role: membership.role,
    isServiceProvider: membership.isServiceProvider,
    isCurrentBusinessDay,
    isClosed: board.isClosed,
    hasOwnRow: board.rows.some((row) => row.membershipId === membership.id),
  });
  async function run(action: () => Promise<void>) {
    if (actionInFlight.current) return;
    actionInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      actionInFlight.current = false;
      setBusy(false);
    }
  }

  function openFinanceClosing() {
    window.location.assign(
      financeClosingHref(membership.store.id, currentDay.businessDate),
    );
  }

  async function closeBusinessDay() {
    const path = `/stores/${membership.store.id}/closings/${currentDay.businessDate}`;
    const preview = await apiRequest<ClosingPreview>(`${path}/preview`);
    const action = homeClosingAction(preview);
    if (action === "CANCEL") {
      setNotice("这个营业日已经日结");
      await onReload();
      return;
    }
    if (action === "REVIEW") {
      openFinanceClosing();
      return;
    }
    try {
      await apiRequest(path, {
        method: "POST",
        idempotent: true,
        body: { force: false },
      });
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "CLOSING_WARNINGS_REQUIRE_FORCE") {
        openFinanceClosing();
        return;
      }
      throw caught;
    }
    setNotice("日结完成");
    await onReload();
  }

  async function cancelBusinessDayClosing() {
    const path = `/stores/${membership.store.id}/closings/${currentDay.businessDate}`;
    const preview = await apiRequest<ClosingPreview>(`${path}/preview`);
    if (homeClosingAction(preview) !== "CANCEL" || !preview.activeClosing) {
      setNotice("这个营业日当前没有有效日结");
      await onReload();
      return;
    }
    await apiRequest(`${path}/cancel`, {
      method: "POST",
      idempotent: true,
      body: { version: preview.activeClosing.version },
    });
    setNotice("已取消日结，可以继续修改记工");
    await onReload();
  }

  async function queueEmployeeClosings() {
    const result = await apiRequest<{ queuedCount: number; skippedCount: number }>(`/stores/${membership.store.id}/closings/${currentDay.businessDate}/deliveries/batch`, { method: "POST", idempotent: true });
    setNotice(`已排队 ${result.queuedCount} 位员工${result.skippedCount ? `，跳过 ${result.skippedCount} 位` : ""}`);
    setDeliveryList(await apiRequest<ClosingDeliveryList>(`/stores/${membership.store.id}/closings/${currentDay.businessDate}/deliveries`));
  }

  async function cancelEmployeeClosingDelivery(delivery: ClosingDeliveryItem) {
    await apiRequest(`/stores/${membership.store.id}/closings/${currentDay.businessDate}/deliveries/${delivery.id}`, { method: "DELETE" });
    setNotice(`已取消 ${delivery.membership.displayName} 的短信发送任务`);
    setDeliveryList(await apiRequest<ClosingDeliveryList>(`/stores/${membership.store.id}/closings/${currentDay.businessDate}/deliveries`));
  }

  async function setRowHidden(row: BoardResponse["rows"][number], isHidden: boolean) {
    const path = `/stores/${membership.store.id}/boards/${currentDay.businessDate}/rows/${row.id}`;
    const result = await apiRequest<{ removed: boolean }>(path, { method: "PATCH", idempotent: true, body: { version: row.version, isHidden } });
    setNotice(result.removed ? `已移除 ${row.membership.displayName} 的当天上班记录` : isHidden ? `已隐藏 ${row.membership.displayName}` : `已恢复 ${row.membership.displayName}`);
    await onReload();
  }

  function openDetailedRecord() {
    if (!startTimeValid) throw new Error("请填写有效的开始时间");
    if (!quickEmployeeId || board.isClosed) return;
    setCreatingRecord(newWorkRecord({
      employeeMembershipId: quickEmployeeId,
      businessDate: currentDay.businessDate,
      storeTimezoneSnapshot: currentDay.timezone,
      businessCutoffSnapshot: currentDay.businessCutoffLocal,
      startAt: businessTimeToIso(currentDay.businessDate, startTime, currentDay.timezone),
      isHighlighted: quickHighlighted,
      isDispatchExcluded: quickDispatchExcluded,
    }));
    setQuickEmployeeId(null);
  }

  async function saveQuickRecord(selection: number | "PLACEHOLDER") {
    if (!startTimeValid) throw new Error("请填写有效的开始时间");
    if (!quickEmployeeId || board.isClosed) return;
    const startAt = businessTimeToIso(currentDay.businessDate, startTime, currentDay.timezone);
    const durationMinutes = selection === "PLACEHOLDER" ? null : selection;
    if (durationMinutes !== null && !quickDurations.includes(durationMinutes)) throw new Error("请选择项目时长");
    await apiRequest(`/stores/${membership.store.id}/work-records`, {
      method: "POST",
      idempotent: true,
      body: {
        employeeMembershipId: quickEmployeeId,
        startAt,
        ...(durationMinutes !== null ? {
          durationMinutes,
          isHighlighted: quickHighlighted,
          isDispatchExcluded: quickDispatchExcluded,
        } : { isPlaceholder: true }),
      },
    });
    setQuickEmployeeId(null);
    setQuickHighlighted(false);
    setQuickDispatchExcluded(false);
    setNotice(selection === "PLACEHOLDER" ? "占位已保存" : "记工已保存，可稍后打开详情填写付款");
    await onReload();
  }

  async function rankBoard() {
    await apiRequest(`/stores/${membership.store.id}/boards/${currentDay.businessDate}/rank`, { method: "POST", idempotent: true, body: { version: board.version } });
    setNotice(isCurrentBusinessDay ? "已按历史名次生成今日顺序" : "已按历史名次生成所选日期顺序");
    await onReload();
  }

  async function reorder(rowId: string, direction: -1 | 1) {
    const index = board.rows.findIndex((row) => row.id === rowId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= board.rows.length) return;
    const rowIds = board.rows.map((row) => row.id);
    [rowIds[index], rowIds[target]] = [rowIds[target]!, rowIds[index]!];
    await saveRowOrder(rowIds);
  }

  async function saveRowOrder(rowIds: string[]) {
    await apiRequest(
      `/stores/${membership.store.id}/boards/${currentDay.businessDate}/reorder`,
      {
        method: "POST",
        idempotent: true,
        body: { version: board.version, rowIds },
      },
    );
    await onReload();
  }

  const secondaryActions = <>
    {canManage && board.isClosed && <button className="secondary-action" type="button" disabled={busy || deliveryList?.batchAllowed === false} title={deliveryList?.batchBlockedReason ?? undefined} onClick={() => run(queueEmployeeClosings)}>{deliveryList?.batchAllowed === false ? "仅可逐人补发" : "发送员工小结"}</button>}
    {canManage && deliveryList && <ClosingDeliveryQueueButton compact={wideLayout} key={currentDay.businessDate} value={deliveryList} busy={busy} onCancel={(delivery) => void run(() => cancelEmployeeClosingDelivery(delivery))} />}
    {canManage && board.isClosed && <button className="secondary-action board-reopen-action" type="button" disabled={busy} onClick={() => run(cancelBusinessDayClosing)}>取消日结</button>}
    {returnToToday}
  </>;
  const dailyActions = <section className="board-toolbar" aria-label="今日操作">
    <div className="board-primary-actions">
      <button className="secondary-action" type="button" disabled={busy} onClick={() => run(onReload)}>刷新</button>
      {showEmployeeClockIn && <button className="primary-action" type="button" disabled={busy} onClick={() => run(async () => {
        await apiRequest(`/stores/${membership.store.id}/shifts/clock-in`, { method: "POST", idempotent: true, body: {} });
        setNotice("已上班，并加入今日表格");
        await onReload();
      })}>{busy ? "正在上班…" : "上班"}</button>}
      {canManage && (board.isClosed
        ? <a className="primary-action board-closing-action" href={financeClosingHref(membership.store.id, currentDay.businessDate)}>现金结算</a>
        : <button className="primary-action board-closing-action" type="button" disabled={busy} onClick={() => run(closeBusinessDay)}>日结</button>)}
      {wideLayout ? secondaryActions : (canManage || canGenerateRanking || returnToToday) && <AutoCloseDetails className="board-more-actions">
        <summary>更多操作</summary>
        <div className="board-more-actions__body">{secondaryActions}</div>
      </AutoCloseDetails>}
    </div>
  </section>;
  const employeeRosterActions = <>
      {canManage && board.isClosed && isCurrentBusinessDay && <section className="board-panel add-employee-panel"><BoardWeeklyDispatch storeId={membership.store.id} businessDate={currentDay.businessDate} members={members} disabled={busy} onSaved={onReload} /></section>}
      {canManage && !board.isClosed && <BoardEmployeePicker
        businessDate={currentDay.businessDate}
        storeId={membership.store.id}
        key={`${membership.store.id}:${currentDay.businessDate}`}
        members={availableMembers}
        allMembers={members}
        weeklyDispatchEnabled={isCurrentBusinessDay || isFutureBusinessDay}
        rankingAction={canGenerateRanking ? { label: dailyRankingActionLabel(board.ranking.rankedAt, isCurrentBusinessDay), onClick: () => run(rankBoard) } : undefined}
        rankingHelp={<RankingExplanationButton board={board} />}
        empty={activeRowCount === 0}
        disabled={busy}
        onAdd={async (membershipId) => {
          await apiRequest(`/stores/${membership.store.id}/boards/${currentDay.businessDate}/rows`, { method: "POST", idempotent: true, body: { membershipId } });
        }}
        onReload={onReload}
      />}
  </>;
  return (
    <>
      <header className={`topbar${wideLayout ? " today-topbar" : ""}`}>
        {wideLayout ? <>
          <div className="today-header-calendar">{calendar}</div>
          {dailyActions}
          <div className="today-heading">{heading}</div>
          {accountActions && <div className="today-header-utilities"><div className="topbar-actions">{accountActions}</div></div>}
        </> : <><div className="today-heading">{heading}</div>{accountActions && <div className="topbar-actions">{accountActions}</div>}</>}
      </header>
      {loadError && <p className="form-error" role="alert">{loadError}</p>}
      {!wideLayout && <div className="business-day-toolbar business-day-toolbar--compact">{dateControls}{dailyActions}</div>}

      {canManage && <section className="board-overview" aria-label="今日全店汇总">
        <header className="overview-heading"><h2>经营概览</h2><span>当前查看的营业日</span></header>
        <div className="summary-strip board-desktop-metrics">
          <OverviewMetric icon="chart" title="折后服务金额＋礼物卡销售实际收款" label="营业额（折扣后）" value={money(board.statistics.revenueCents)} />
          {board.isClosed && board.statistics.recentClosedRevenue && <OverviewMetric icon="clock" label={`过去${board.statistics.recentClosedRevenue.dayCount}天平均营业额`} value={money(board.statistics.recentClosedRevenue.averageCents)} />}
          <OverviewMetric icon="discount" label="折扣总额" value={money(board.statistics.discountTotalCents)} />
          {board.isClosed ? <CashChangeMetric cents={board.statistics.cashChangeCents} /> : <OverviewMetric icon="gift" title="礼物卡销售实际收款" label="礼物卡总额" value={money(board.statistics.giftCardSalesAmountCents)} />}
          <OverviewMetric icon="wallet" title="营业额＋现金小费＋刷卡小费－员工应得" label="店铺收入" value={money(board.statistics.storeIncomeCents)} />
          <OverviewMetric icon="trend" title="店铺收入＋店长收入＋经理收入；已加卖卡实收、减礼物卡使用的大费和小费" label="总收入" value={money(board.statistics.totalIncomeCents)} />
        </div>
        <div className="board-mobile-metrics">
        <div className="summary-strip board-key-metrics">
          <OverviewMetric icon="chart" title="折后服务金额＋礼物卡销售实际收款" label="营业额（折扣后）" value={money(board.statistics.revenueCents)} />
          <OverviewMetric icon="trend" title="店铺收入＋店长收入＋经理收入；已加卖卡实收、减礼物卡使用的大费和小费" label="总收入" value={money(board.statistics.totalIncomeCents)} />
        </div>
        <details className="board-summary-details">
          <summary>更多汇总</summary>
          <div className="summary-strip board-extra-metrics">
            {board.isClosed && board.statistics.recentClosedRevenue && <OverviewMetric icon="clock" label={`过去${board.statistics.recentClosedRevenue.dayCount}天平均营业额`} value={money(board.statistics.recentClosedRevenue.averageCents)} />}
            <OverviewMetric icon="discount" label="折扣总额" value={money(board.statistics.discountTotalCents)} />
            {board.isClosed ? <CashChangeMetric cents={board.statistics.cashChangeCents} /> : <OverviewMetric icon="gift" title="礼物卡销售实际收款" label="礼物卡总额" value={money(board.statistics.giftCardSalesAmountCents)} />}
            <OverviewMetric icon="wallet" title="营业额＋现金小费＋刷卡小费－员工应得" label="店铺收入" value={money(board.statistics.storeIncomeCents)} />
          </div>
        </details>
        </div>
      </section>}


      {board.isClosed && <p className="closed-banner" role="status">{canChangeRowVisibility ? "这个营业日已经日结。可隐藏或恢复员工出勤，影响后续生成顺序；修改记工或员工顺序仍须先取消日结。" : "这个营业日已经日结。记工、员工顺序和显示状态均为只读；如需修改请先取消日结。"}</p>}
      {notice && <p className="success-banner" role="status">✓ {notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="board-section-heading"><UiIcon name="log" /><h2>员工记工</h2><span>{visibleRows.length} <span>位员工</span></span></div>
      {employeeRosterActions}
      <section className="board" id="today" aria-label={isCurrentBusinessDay ? "今日员工记工表" : canManage ? "历史员工记工表" : "我的历史记工表"}>
        {visibleRows.length === 0 && (
          <div className="board-panel board-empty-state empty-state"><strong>{isCurrentBusinessDay ? "今日表格还是空的" : canManage ? "这个营业日没有记工" : "这个营业日没有你的记工"}</strong><p>{showEmployeeClockIn ? "点击上方“上班”，把自己加入今日表格。" : isCurrentBusinessDay ? "店长或经理可以把参与记工的员工加入今日表格。" : canManage ? "可以选择其他营业日继续查看。" : "这里只会显示你自己的历史记录，可以选择其他营业日继续查看。"}</p></div>
        )}
        {visibleRows.map((row) => {
          const isCollapsed = collapsed.includes(row.id);
          const activeRecord = isCurrentBusinessDay
            ? activeWorkRecord(row.workRecords, statusNow)
            : null;
          const workStatus = activeRecord
            ? (activeRecord.endAt ? displayTime(activeRecord.endAt, currentDay.timezone) : "未定")
            : "空闲";
          const showTotals = canViewEmployeeTotals({
            role: membership.role,
            viewerMembershipId: membership.id,
            rowMembershipId: row.membershipId,
          });
          return (
            <article className={`employee-row${isCollapsed ? " employee-row--collapsed" : ""}${row.isHidden && canManage ? " employee-row--hidden" : ""}`} key={row.id}>
              <header className="employee-header">
                <button
                  className="employee-toggle"
                  type="button"
                  onClick={() => setCollapsed((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])}
                  aria-expanded={!isCollapsed}
                >
                  <span className="employee-avatar" aria-hidden="true">{row.membership.displayName.slice(0, 1)}</span>
                  <span>
                    <strong>{row.membership.displayName}</strong>
                    <small className={activeRecord ? "on-duty" : "off-duty"}>{workStatus}</small>
                  </span>
                  {row.isHidden && canManage && <em className="hidden-badge">已隐藏</em>}
                  <span className="chevron" aria-hidden="true">{isCollapsed ? "展开" : "收起"}</span>
                </button>
                <div className="row-tools">
                  {canChangeRowVisibility && <AutoCloseDetails className="row-management"><summary>员工操作</summary><div>
                    {!board.isClosed && <><button type="button" disabled={busy || board.rows[0]?.id === row.id} onClick={() => run(() => reorder(row.id, -1))}>上移</button><button type="button" disabled={busy || board.rows.at(-1)?.id === row.id} onClick={() => run(() => reorder(row.id, 1))}>下移</button></>}
                    {board.ranking.enabled && !board.isClosed && <button type="button" disabled={busy} onClick={() => run(async () => { await apiRequest(`/stores/${membership.store.id}/boards/${currentDay.businessDate}/rows/${row.id}/remove`, { method: "POST", idempotent: true, body: { version: row.version } }); setNotice(`已移除 ${row.membership.displayName}`); await onReload(); })}>移除</button>}
                    <button type="button" disabled={busy} onClick={() => run(() => setRowHidden(row, !row.isHidden))}>{row.isHidden ? "恢复显示" : "隐藏"}</button>
                  </div></AutoCloseDetails>}
                  <span className="row-work-count" title="记工数" aria-label={`${serviceRecordCount(row.workRecords)} 条记工`}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="5" width="14" height="16" rx="2" /><path d="M9 5V3h6v2M9 11h6M9 16h6" /></svg>
                    <strong>{serviceRecordCount(row.workRecords)}</strong>
                  </span>
                  {(canManage || row.membershipId === membership.id) && <button className="row-closing-action" type="button" onClick={() => setClosingEmployee({ id: row.membershipId, displayName: row.membership.displayName })}>个人日结</button>}
                </div>
              </header>

              {!isCollapsed && (
                <div className={`employee-content${showTotals ? "" : " employee-content--records-only"}`}>
                  <RecordTrack key={currentDay.businessDate} autoReturn={!board.isClosed}>
                    {recordTrackItems(row.workRecords, !board.isClosed && !row.isHidden && (isCurrentBusinessDay || canManage)).map((record) => {
                      if (record === null) return (
                        <button key="add-record" className="add-record" type="button" onClick={() => { setStartTime(currentStoreTime(currentDay.timezone)); setStartTimeValid(true); setQuickHighlighted(false); setQuickDispatchExcluded(false); setQuickEmployeeId(row.membershipId); }}>
                          <span aria-hidden="true"><UiIcon name="plus" /></span>新增记工
                        </button>
                      );
                      if (record.status === "PLACEHOLDER") return (
                        <button className="record-card record-card--placeholder" key={record.id} type="button" aria-label="占位" aria-describedby={`placeholder-time-${record.id}`}
                          disabled={!isCurrentBusinessDay && !canManage} title={!isCurrentBusinessDay && !canManage ? "历史记录只读" : undefined}
                          onClick={() => setDeletingPlaceholder(record)}>
                          <svg className="record-placeholder-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                            <line x1="0" y1="0" x2="100" y2="100" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                            <line x1="100" y1="0" x2="0" y2="100" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                          </svg>
                          <time id={`placeholder-time-${record.id}`} className="record-time record-placeholder-time" dateTime={record.startAt}>{displayTime(record.startAt, currentDay.timezone)}</time>
                        </button>
                      );
                      const hasNote = Boolean(record.note.trim());
                      const hasPaymentMismatch = hasConfirmedPaymentMismatch(
                        record.status,
                        record.paymentDifferenceCents,
                      );
                      return (
                      <button
                        className={`record-card${record.status === "PENDING_PAYMENT" ? " record-card--pending" : ""}${record.isHighlighted || record.isDispatchExcluded ? " record-card--right-group" : ""}${record.isHighlighted ? " record-card--highlighted" : ""}${hasNote ? " record-card--has-note" : ""}${hasPaymentMismatch ? " record-card--payment-mismatch" : ""}`}
                        key={record.id}
                        type="button"
                        disabled={!isCurrentBusinessDay && !canManage}
                        title={!isCurrentBusinessDay && !canManage ? "历史记录只读" : undefined}
                        onClick={() => setEditingRecord(record)}
                      >
                        <span className="record-card__topline">
                          <strong>{record.serviceSnapshot?.shortName ?? "待选项目"}</strong>
                          <span className="record-card__badges">
                            {record.addonSnapshots.length > 0 && <span className="record-addon-badge" aria-label="有加项" title="有加项">＋</span>}
                            {record.discountSnapshots.length > 0 && (
                              <span
                                className="record-discount-badge"
                                aria-label={`折扣 ${money(record.discountTotalCents)}`}
                                title={`折扣 ${money(record.discountTotalCents)}`}
                              >
                                {discountBadgeText(record.discountTotalCents)}
                              </span>
                            )}
                          </span>
                        </span>
                        <span className="record-time">{displayTime(record.startAt, currentDay.timezone)}–{displayTime(record.endAt, currentDay.timezone)}</span>
                        <span className="record-money">
                          <span className="record-service-amount">
                            <b>{record.serviceSnapshot ? compactPaymentAmount(record.grossFeeBaseCents) : "未填写"}</b>
                            <span className={`record-service-payment-box${record.status === "PENDING_PAYMENT" ? " record-service-payment-box--pending" : ""}`}>
                              <span>{record.status === "PENDING_PAYMENT" ? "应收" : "实收"}</span>
                              {record.status === "PENDING_PAYMENT" ? (
                                <span className="record-service-due">{record.serviceSnapshot ? compactPaymentAmount(record.discountedFeePerformanceCents) : "未填写"}</span>
                              ) : (
                                <PaymentBreakdown status={record.status} cashCents={record.cashServiceCents} cardCents={record.cardServiceCents} giftCardCents={record.giftCardServiceCents} zeroLabel="0" />
                              )}
                            </span>
                          </span>
                          <span className="record-payment-row"><span>小费</span><PaymentBreakdown status={record.status} cashCents={record.cashTipCents} cardCents={record.cardTipCents} giftCardCents={record.giftCardTipCents} zeroLabel="0" /></span>
                        </span>
                        <span className="record-card__indicators">
                          {hasPaymentMismatch && (
                            <span
                              className="record-payment-mismatch-badge"
                              aria-label={`付款差额 ${money(Math.abs(record.paymentDifferenceCents ?? 0))}`}
                              title="实收服务费与应收金额不一致"
                            >!</span>
                          )}
                          {record.status === "PENDING_PAYMENT" && (
                            <span className="record-pending-badge">待结账</span>
                          )}
                          {hasNote && (
                            <span className="record-note-badge" aria-label="有备注" title="有备注">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>
                            </span>
                          )}
                        </span>
                      </button>
                      );
                    })}
                  </RecordTrack>
                  {showTotals && <dl className="employee-totals">
                    <div><dt>大费</dt><dd>{money(row.statistics.grossFeeBaseCents)}</dd></div>
                    <div><dt>小费</dt><dd>{money(row.statistics.totalTipCents)}</dd></div>
                    <div><dt>应得</dt><dd>{money(row.statistics.employeeIncomeCents)}</dd></div>
                  </dl>}
                </div>
              )}
            </article>
          );
        })}
      </section>

      {(canManage || isCurrentBusinessDay) && <div className="board-store-projects"><GiftCardSales
        storeId={membership.store.id}
        businessDate={currentDay.businessDate}
        sales={board.giftCardSales}
        nextSerialNumber={board.nextGiftCardSerialNumber}
        discountSettings={store}
        members={members}
        defaultOperatorMembershipId={membership.id}
        canEdit={!board.isClosed && (isCurrentBusinessDay || canManage)}
        onReload={onReload}
      /><LostCustomers
        key={`${membership.store.id}:${currentDay.businessDate}`}
        storeId={membership.store.id}
        businessDate={currentDay.businessDate}
        canEdit={!board.isClosed && !isFutureBusinessDay && (isCurrentBusinessDay || canManage)}
      /></div>}

      {hiddenRows.length > 0 && <section className="hidden-rows-panel" aria-label="已隐藏员工管理">
        <header><div><strong>已隐藏员工 · {hiddenRows.length}</strong><p>隐藏后排工视为该日未上班，后续生成顺序会跳过该日；记工和财务保留。恢复后重新计入出勤，今日已有顺序需重新生成。</p></div><button className="secondary-action compact" type="button" onClick={() => setShowHidden((value) => !value)}>{showHidden ? "收起隐藏内容" : "查看隐藏内容"}</button></header>
        <div>{hiddenRows.map((row) => <article key={row.id}><span className="employee-avatar" aria-hidden="true">{row.membership.displayName.slice(0, 1)}</span><div><strong>{row.membership.displayName}</strong><small>{serviceRecordCount(row.workRecords)} 条记工</small></div><button className="primary-action compact" type="button" disabled={busy || !canChangeRowVisibility} onClick={() => run(() => setRowHidden(row, false))}>恢复显示</button></article>)}</div>
      </section>}

      {quickEmployeeId && createPortal(
        <div className="modal-backdrop" role="presentation">
          <section className="quick-modal quick-work-modal" role="dialog" aria-modal="true" aria-labelledby="quick-modal-title">
            <div className="modal-heading">
              <div><p className="eyebrow">快速记工</p><h2 id="quick-modal-title">{members.find((item) => item.id === quickEmployeeId)?.displayName}</h2></div>
              <button className="secondary-action quick-detailed-entry" type="button" disabled={busy || board.isClosed} onClick={() => run(async () => openDetailedRecord())}>详细记工</button>
              <button className="close-button" type="button" disabled={busy} onClick={() => setQuickEmployeeId(null)}>关闭</button>
              <div className="modal-heading__actions">
                <button className="highlight-toggle placeholder-toggle" type="button" disabled={busy || board.isClosed} onClick={() => run(() => saveQuickRecord("PLACEHOLDER"))}>占位</button>
                <button className={`highlight-toggle dispatch-excluded-toggle${quickDispatchExcluded ? " active" : ""}`} type="button" aria-pressed={quickDispatchExcluded} disabled={busy || board.isClosed} onClick={() => setQuickDispatchExcluded((current) => !current)}>不算排工</button>
                <button className={`highlight-toggle${quickHighlighted ? " active" : ""}`} type="button" aria-pressed={quickHighlighted} disabled={busy || board.isClosed} onClick={() => setQuickHighlighted((current) => !current)}><span aria-hidden="true">★</span>{quickHighlighted ? "已高亮" : "高亮标记"}</button>
              </div>
            </div>
            <div className="quick-modal-content">
              <label className="field-label" htmlFor="start-time">开始时间</label>
              <WorkTimeInput id="start-time" value={startTime} onChange={setStartTime} onValidityChange={setStartTimeValid} />
              <fieldset className={`duration-picker${quickDurations.length === 3 ? " duration-picker--three-options" : ""}`} disabled={busy || board.isClosed}>
                <legend>选择时长</legend>
                {quickDurations.map((durationMinutes) => (
                  <button key={durationMinutes} type="button" onClick={() => run(() => saveQuickRecord(durationMinutes))}>
                    <strong>{durationMinutes} 分钟</strong>
                  </button>
                ))}
                {quickDurations.length === 0 && <p className="empty-note">没有可用时长，请先在项目设置中添加。</p>}
              </fieldset>
              <p className="modal-note">点击时长即保存记工，点击占位即保存占位；请先调整时间及标记。付款和小费可稍后在详情补充。</p>
              {error && <p className="form-error" role="alert">{error}</p>}
            </div>
          </section>
        </div>,
        document.body,
      )}

      {deletingPlaceholder && <PlaceholderDeleteDialog storeId={membership.store.id} record={deletingPlaceholder}
        employeeName={members.find((member) => member.id === deletingPlaceholder.employeeMembershipId)?.displayName ?? "员工"}
        timezone={currentDay.timezone} canDelete={isCurrentBusinessDay || canManage} isClosed={board.isClosed}
        onClose={() => setDeletingPlaceholder(null)} onDeleted={() => setNotice("占位已删除")} onChanged={onReload} />}

      {(creatingRecord || editingRecord) && (
        <RecordEditor
          storeId={membership.store.id}
          timezone={currentDay.timezone}
          businessDate={currentDay.businessDate}
          autoDiscountSettings={store}
          record={(creatingRecord ?? editingRecord)!}
          isNew={creatingRecord !== null}
          catalog={catalog}
          members={members}
          canManage={canManage}
          isClosed={board.isClosed}
          onClose={() => { setEditingRecord(null); setCreatingRecord(null); }}
          onSaved={() => setNotice(creatingRecord ? "记工已保存" : "记工修改已保存")}
          onChanged={onReload}
        />
      )}

      {closingEmployee && (
        <EmployeeClosingModal
          storeId={membership.store.id}
          businessDate={currentDay.businessDate}
          membershipId={closingEmployee.id}
          displayName={closingEmployee.displayName}
          canSend={canManage}
          onClose={() => setClosingEmployee(null)}
        />
      )}
    </>
  );
}
