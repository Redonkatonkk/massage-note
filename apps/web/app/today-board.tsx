"use client";

import { useScreenFeedback } from "./screen-feedback";

import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
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
  leftTrackRecordCount,
} from "../lib/board";
import { homeClosingAction } from "../lib/closing";
import {
  canGenerateDailyRanking,
  dailyRankingActionLabel,
  dailyRankingClipboardText,
} from "../lib/daily-ranking";
import { copyText } from "../lib/clipboard";
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
import { CashClosingConfirm } from "./cash-closing-confirm";
import { LostCustomers } from "./lost-customers";
import { GiftCardSales } from "./gift-card-sales";
import { WorkTimeInput } from "./work-time-input";
import { RankingExplanationButton } from "./ranking-explanation";
import { BoardWeeklyDispatch } from "./board-weekly-dispatch";
import { BoardEmployeePicker } from "./board-employee-picker";
import { RecordTrack } from "./record-track";
import { animateOverlayExit, useListMotion, useOverlayExitRef, usePanelHeight, withButtonMotion } from "./ui/interaction-motion";
import { RecordEditor, type RecordEditorSection } from "./record-editor";
import { PlaceholderDeleteDialog } from "./placeholder-delete-dialog";
import { PlaceholderCard } from "./placeholder-card";
import { AutoCloseDetails } from "./auto-close-details";
import { OverviewMetric, UiIcon } from "./ui/primitives";
import { CustomerTypeSwitch } from "./customer-type-switch";
import { CustomerTypeMetric } from "./customer-type-metric";
import { QuickWorkModeSwitch, type QuickWorkMode } from "./quick-work-mode-switch";
import { beginDetachedWorkRecordSaveMotion, preloadWorkRecordSaveMotion } from "../lib/work-record-save-motion";

import { WorkRecordSaveProvider, useWorkRecordSaveManager, useWorkRecordSaveTasks } from "./work-record-save-provider";
import { recordSaveLocked, unresolvedWrite, type PreparedRecordSave, type WorkRecordSaveTask } from "../lib/work-record-saves";
import { closedRecordBusinessDate } from "../lib/record-closing";

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
  onSaveReload?: (() => Promise<void>) | undefined;
}

function money(cents: number | null): string {
  return cents === null ? "未填写" : formatUsd(cents);
}

function CashBalanceMetric({ balance }: { balance: NonNullable<BoardResponse["statistics"]["cashBalance"]> }) {
  const { locale, t } = useLanguage();
  return <OverviewMetric label="现金余额"
    value={balance.balanceCents === null ? "—" : formatUsdPrecise(balance.balanceCents, locale)}
    title="重置金额＋重置日起的现金大费和卖卡现金实收－员工已结现金，现金小费不计入。"
    note={balance.missingClosingDates.length ? `${t("历史数据不足，请补充日结：")}${balance.missingClosingDates.join(", ")}` : `${t("重置日：")}${balance.resetDate}`} />;
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

function tiltRecordCard({ pointerType, currentTarget: card, clientX, clientY }: PointerEvent<HTMLElement>) {
  if (pointerType !== "mouse" || !window.matchMedia?.("(any-hover: hover) and (any-pointer: fine) and (prefers-reduced-motion: no-preference)").matches) return;
  const track = card.offsetParent;
  if (!(track instanceof HTMLElement) || !track.classList.contains("record-track")) return;
  const { left, top } = track.getBoundingClientRect();
  const { offsetWidth: width, offsetHeight: height } = card;
  const x = clientX - left + track.scrollLeft - card.offsetLeft;
  const y = clientY - top + track.scrollTop - card.offsetTop;
  // Ease the travel near the original hit area edges so the hover cannot outrun a click.
  const strength = Math.max(0, Math.min(x, y, width - x, height - y, 10)) / 10;
  const pitch = (1 - 2 * y / height) * 5 * strength;
  const yaw = (2 * x / width - 1) * 5 * strength;
  card.style.setProperty("--record-card-hover", `perspective(650px) translateY(${(-4 * strength).toFixed(2)}px) rotateX(${pitch.toFixed(2)}deg) rotateY(${yaw.toFixed(2)}deg)`);
}

function resetRecordCardTilt({ currentTarget }: PointerEvent<HTMLElement>) {
  currentTarget.style.removeProperty("--record-card-hover");
}

const recordCardHover = { onPointerMove: tiltRecordCard, onPointerLeave: resetRecordCardTilt, onPointerCancel: resetRecordCardTilt };

export function TodayBoard(props: TodayBoardProps) {
  const manager = useWorkRecordSaveManager();
  return manager ? <TodayBoardContent {...props} /> : <WorkRecordSaveProvider><TodayBoardContent {...props} /></WorkRecordSaveProvider>;
}

function TodayBoardContent({
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
  onReload, onSaveReload,
}: TodayBoardProps) {
  const { t } = useLanguage();
  const saves = useWorkRecordSaveManager()!;
  const { tasks: saveTasks, recovery } = useWorkRecordSaveTasks(saves);
  const scope = { storeId: membership.store.id, businessDate: currentDay.businessDate };
  const pendingDayWrites = saveTasks.some(task => task.storeId === scope.storeId && task.businessDate === scope.businessDate && unresolvedWrite(task));
  const recordLocked = (id: string) => saveTasks.some(task => task.storeId === scope.storeId && task.recordId === id && recordSaveLocked(task));
  useEffect(() => saves.registerView({ storeId: membership.store.id, businessDate: currentDay.businessDate, refresh: onSaveReload ?? onReload }), [saves, membership.store.id, currentDay.businessDate, onSaveReload, onReload]);
  const canManage = membership.role !== "EMPLOYEE";
  const cashBalance = board.statistics.cashBalance;
  const canChangeRowVisibility = canManage && (!board.isClosed || (!isCurrentBusinessDay && !isFutureBusinessDay));
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [rankingSetupRequest, setRankingSetupRequest] = useState(0);
  const [quickEmployeeId, setQuickEmployeeId] = useState<string | null>(null);
  const [quickServiceId, setQuickServiceId] = useState("");
  const [quickMode, setQuickMode] = useState<QuickWorkMode>("NORMAL");
  const [quickCustomerType, setQuickCustomerType] = useState<NonNullable<WorkRecord["customerType"]> | null>(null);
  const quickDialog = useRef<HTMLElement>(null);
  const quickDialogRef = useOverlayExitRef(quickDialog);
  usePanelHeight(quickDialog, Boolean(quickEmployeeId), quickMode === "PLACEHOLDER");
  const [quickSessionId, setQuickSessionId] = useState(() => crypto.randomUUID());
  const [editorSessionId, setEditorSessionId] = useState(() => crypto.randomUUID());
  const [restoredSave, setRestoredSave] = useState<WorkRecordSaveTask | null>(null);
  const [startTimeValid, setStartTimeValid] = useState(true);
  const [startTime, setStartTime] = useState(currentStoreTime(currentDay.timezone));
  const [creatingRecord, setCreatingRecord] = useState<WorkRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<{ record: WorkRecord; section?: RecordEditorSection | undefined } | null>(null);
  const [deletingPlaceholder, setDeletingPlaceholder] = useState<WorkRecord | null>(null);
  const [closingEmployee, setClosingEmployee] = useState<{ id: string; displayName: string } | null>(null);
  const [confirmClosingCash, setConfirmClosingCash] = useState(false);
  const [busy, setBusy] = useState(false);
  const actionInFlight = useRef(false);
  const { feedback, setNotice, setError } = useScreenFeedback();
  const [deliveryList, setDeliveryList] = useState<ClosingDeliveryList | null>(null);
  useEffect(() => { if (loadError) setError(loadError); }, [loadError, setError]);
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
      else setEditingRecord({ record });
    } else {
      setError("没有找到这条异常记工，记录可能已被删除或不属于当前店铺。");
    }
    onInitialRecordOpened?.();
  }, [board.rows, initialRecordId, onInitialRecordOpened]);

  useEffect(() => {
    if (!quickEmployeeId) return;
    preloadWorkRecordSaveMotion();
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

  const quickServices = useMemo(() => catalog.serviceItems
    .filter((service) => service.isEnabled && !service.deletedAt)
    .sort((a, b) => a.position - b.position), [catalog.serviceItems]);
  const quickService = quickServices.find((service) => service.id === quickServiceId) ?? quickServices[0];
  const quickDurations = [...new Set(quickService?.priceOptions.map((option) => option.durationMinutes) ?? [])]
    .sort((a, b) => a - b);

  const visibleRows = useMemo(
    () => board.rows.filter((row) => !row.isHidden || !canManage || showHidden),
    [board.rows, canManage, showHidden],
  );
  const boardMotion = useListMotion<HTMLElement>(visibleRows.map(row => `${row.id}:${collapsed.includes(row.id)}`).join(" "));
  const [entranceOrder] = useState(() => new Map(visibleRows.map((row, index) => [row.id, index])));
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

  function openRecord(record: WorkRecord, section?: RecordEditorSection) {
    setEditorSessionId(crypto.randomUUID());
    setRestoredSave(null);
    setEditingRecord({ record, section });
  }

  useEffect(() => {
    saves.setRestoreBlocked(Boolean(quickEmployeeId || creatingRecord || editingRecord || deletingPlaceholder || closingEmployee));
  }, [saves, quickEmployeeId, creatingRecord, editingRecord, deletingPlaceholder, closingEmployee]);
  useEffect(() => () => saves.setRestoreBlocked(false), [saves]);
  useEffect(() => {
    if (!recovery || quickEmployeeId || creatingRecord || editingRecord || deletingPlaceholder || closingEmployee) return;
    const task = saves.takeRecovery({ storeId: membership.store.id, businessDate: currentDay.businessDate });
    if (!task) return;
    setRestoredSave(task);
    const draft = task.draft;
    if (draft.kind === "quick") {
      setQuickSessionId(crypto.randomUUID()); setQuickEmployeeId(draft.employeeId);
      setQuickCustomerType(draft.customerType ?? null); setQuickServiceId(draft.serviceId); setQuickMode(draft.mode); setStartTime(draft.startTime); setStartTimeValid(true);
    } else {
      setEditorSessionId(crypto.randomUUID());
      if (draft.isNew) setCreatingRecord(draft.record); else setEditingRecord({ record: draft.record });
    }
  }, [saves, recovery, membership.store.id, currentDay.businessDate, quickEmployeeId, creatingRecord, editingRecord, deletingPlaceholder, closingEmployee]);

  async function closeBusinessDay(confirmUnsettledCash = false) {
    if (saves.getSnapshot().tasks.some(task => task.storeId === membership.store.id && task.businessDate === currentDay.businessDate && unresolvedWrite(task))) return;
    const path = `/stores/${membership.store.id}/closings/${currentDay.businessDate}`;
    if (!confirmUnsettledCash) {
      const preview = await apiRequest<ClosingPreview>(`${path}/preview`);
      const action = homeClosingAction(preview);
      if (action === "CANCEL") {
        setNotice("这个营业日已经日结");
        await onReload();
        return;
      }
      if (action === "CONFIRM_CASH") {
        setConfirmClosingCash(true);
        return;
      }
      if (action === "REVIEW") {
        openFinanceClosing();
        return;
      }
    }
    try {
      await apiRequest(path, {
        method: "POST",
        idempotent: true,
        body: confirmUnsettledCash ? { force: false, confirmUnsettledCash: true } : { force: false },
      });
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "CLOSING_UNSETTLED_CASH_REQUIRE_CONFIRMATION") {
        setConfirmClosingCash(true);
        return;
      }
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

  async function setRowHidden(row: BoardResponse["rows"][number], isHidden: boolean, target?: HTMLElement | null) {
    const path = `/stores/${membership.store.id}/boards/${currentDay.businessDate}/rows/${row.id}`;
    const result = await apiRequest<{ removed: boolean }>(path, { method: "PATCH", idempotent: true, body: { version: row.version, isHidden } });
    if (isHidden || target?.closest(".hidden-rows-panel")) animateOverlayExit(target, { backdrop: false, y: -4 });
    setNotice(result.removed ? `已移除 ${row.membership.displayName} 的当天上班记录` : isHidden ? `已隐藏 ${row.membership.displayName}` : `已恢复 ${row.membership.displayName}`);
    await onReload();
  }

  function openDetailedRecord() {
    if (!startTimeValid) throw new Error("请填写有效的开始时间");
    if (!quickEmployeeId || board.isClosed || quickMode === "PLACEHOLDER") return;
    setEditorSessionId(crypto.randomUUID()); setRestoredSave(null);
    setCreatingRecord(newWorkRecord({
      employeeMembershipId: quickEmployeeId,
      businessDate: currentDay.businessDate,
      storeTimezoneSnapshot: currentDay.timezone,
      businessCutoffSnapshot: currentDay.businessCutoffLocal,
      startAt: businessTimeToIso(currentDay.businessDate, startTime, currentDay.timezone),
      customerType: quickCustomerType,
      isHighlighted: quickMode === "HIGHLIGHTED",
      isDispatchExcluded: quickMode === "DISPATCH_EXCLUDED",
    }));
    setQuickEmployeeId(null);
  }

  function saveQuickRecord(selection: number | "PLACEHOLDER") {
    try {
      if (!startTimeValid) throw new Error("请填写有效的开始时间");
      if (!quickEmployeeId || board.isClosed) return;
      if ((selection === "PLACEHOLDER") !== (quickMode === "PLACEHOLDER")) return;
      const startAt = businessTimeToIso(currentDay.businessDate, startTime, currentDay.timezone);
      const durationMinutes = selection === "PLACEHOLDER" ? null : selection;
      if (durationMinutes !== null && !quickDurations.includes(durationMinutes)) throw new Error("请选择项目时长");
      const accepted = saves.submit({
        id: quickSessionId, ...scope, storeName: membership.store.name,
        employeeName: members.find(member => member.id === quickEmployeeId)?.displayName ?? "员工",
        draft: { kind: "quick", employeeId: quickEmployeeId, serviceId: quickService?.id ?? "", mode: quickMode, startTime, customerType: quickCustomerType },
        motion: beginDetachedWorkRecordSaveMotion(quickDialog.current),
        request: { path: `/stores/${membership.store.id}/work-records`, method: "POST", body: {
          employeeMembershipId: quickEmployeeId, startAt,
          ...(durationMinutes !== null ? { customerType: quickCustomerType, serviceItemId: quickService!.id, serviceDurationMinutes: durationMinutes,
            isHighlighted: quickMode === "HIGHLIGHTED", isDispatchExcluded: quickMode === "DISPATCH_EXCLUDED" } : { isPlaceholder: true }),
        } },
      });
      if (accepted) { quickDialog.current?.setAttribute("data-motion-skip-exit", ""); setQuickEmployeeId(null); setQuickMode("NORMAL"); setRestoredSave(null); }
    } catch (caught) { setError(errorMessage(caught)); }
  }

  function submitEditor(submission: PreparedRecordSave) {
    const record = creatingRecord ?? editingRecord?.record;
    if (!record) return false;
    const accepted = saves.submit({
      id: editorSessionId, ...scope, storeName: membership.store.name,
      employeeName: members.find(member => member.id === submission.employeeId)?.displayName ?? "员工",
      recordId: creatingRecord ? undefined : record.id,
      request: { path: submission.path, method: submission.method, body: submission.body },
      draft: { kind: "editor", record, isNew: creatingRecord !== null,
        initialServiceItemId: restoredSave?.draft.kind === "editor" ? restoredSave.draft.initialServiceItemId : creatingRecord ? quickService?.id : undefined, fields: submission.fields },
      draftKey: submission.draftKey, motion: beginDetachedWorkRecordSaveMotion(submission.dialog),
    });
    if (accepted) { setEditingRecord(null); setCreatingRecord(null); setRestoredSave(null); }
    return accepted;
  }

  async function rankBoard() {
    try {
      await apiRequest(`/stores/${membership.store.id}/boards/${currentDay.businessDate}/rank`, { method: "POST", idempotent: true, body: { version: board.version } });
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === "DAILY_RANKING_SETUP_REQUIRED") { setRankingSetupRequest(value => value + 1); return; }
      throw caught;
    }
    setNotice(isCurrentBusinessDay ? "已生成今日顺序" : "已生成所选日期顺序");
    await onReload();
  }

  async function copyRanking() {
    try {
      await copyText(dailyRankingClipboardText(currentDay.businessDate, board.rows));
    } catch {
      throw new Error("复制排工顺序失败，请重试。");
    }
    setNotice("排工顺序已复制");
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
      <button className="secondary-action" type="button" disabled={busy} onClick={event => void withButtonMotion(event.currentTarget, () => run(onReload))}>刷新</button>
      {showEmployeeClockIn && <button className="primary-action" type="button" disabled={busy} onClick={() => run(async () => {
        await apiRequest(`/stores/${membership.store.id}/shifts/clock-in`, { method: "POST", idempotent: true, body: {} });
        setNotice("已上班，并加入今日表格");
        await onReload();
      })}>{busy ? "正在上班…" : "上班"}</button>}
      {canManage && (board.isClosed
        ? <a className="primary-action board-closing-action" href={financeClosingHref(membership.store.id, currentDay.businessDate)}>现金结算</a>
        : <CashClosingConfirm className="primary-action board-closing-action" type="button" disabled={busy || pendingDayWrites}
            title={pendingDayWrites ? "请先等待当天记工的保存结果确认" : undefined} open={confirmClosingCash}
            onDismiss={() => setConfirmClosingCash(false)}
            onConfirm={() => { setConfirmClosingCash(false); void run(() => closeBusinessDay(true)); }}
            onClick={event => void withButtonMotion(event.currentTarget, () => run(closeBusinessDay))}>日结</CashClosingConfirm>)}
      {wideLayout ? secondaryActions : (canManage || canGenerateRanking || returnToToday) && <AutoCloseDetails className="board-more-actions">
        <summary>更多操作</summary>
        <div className="board-more-actions__body">{secondaryActions}</div>
      </AutoCloseDetails>}
    </div>
  </section>;
  const employeeRosterActions = <>
      {canManage && board.isClosed && <section className="board-panel add-employee-panel">
        {isCurrentBusinessDay && <BoardWeeklyDispatch storeId={membership.store.id} businessDate={currentDay.businessDate} members={members} disabled={busy} onSaved={onReload} />}
        <div className="ranking-action-group"><span>排序依据</span><RankingExplanationButton board={board} readOnly /></div>
      </section>}
      {canManage && !board.isClosed && <BoardEmployeePicker
        businessDate={currentDay.businessDate}
        storeId={membership.store.id}
        key={`${membership.store.id}:${currentDay.businessDate}`}
        members={availableMembers}
        allMembers={members}
        weeklyDispatchEnabled={isCurrentBusinessDay || isFutureBusinessDay}
        rankingAction={canGenerateRanking ? { label: dailyRankingActionLabel(board.ranking.rankedAt, isCurrentBusinessDay), onClick: () => run(rankBoard) } : undefined}
        onCopyRanking={isFutureBusinessDay ? () => run(copyRanking) : undefined}
        rankingSetupRequest={rankingSetupRequest}
        rankingHelp={<RankingExplanationButton board={board} readOnly={!canGenerateRanking} />}
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
        <div className="today-heading">{heading}</div>
        {accountActions && (wideLayout
          ? <div className="today-header-utilities"><div className="topbar-actions">{accountActions}</div></div>
          : <div className="topbar-actions">{accountActions}</div>)}
        {wideLayout && <div className="today-header-actions">{dailyActions}</div>}
        {wideLayout && <div className="today-header-calendar">{calendar}</div>}
      </header>
      {!wideLayout && <div className="business-day-toolbar business-day-toolbar--compact">{dateControls}{dailyActions}</div>}

      {canManage && <section className="board-overview" aria-label="今日全店汇总">
        <header className="overview-heading"><h2>经营概览</h2><span>当前查看的营业日</span></header>
        <div className="summary-strip board-desktop-metrics">
          <OverviewMetric title="折后服务金额＋礼物卡销售实际收款" label="营业额（折扣后）" value={money(board.statistics.revenueCents)} />
          {board.isClosed && board.statistics.recentClosedRevenue && <OverviewMetric label={`过去${board.statistics.recentClosedRevenue.dayCount}天平均营业额`} value={money(board.statistics.recentClosedRevenue.averageCents)} />}
          <OverviewMetric label="折扣总额" value={money(board.statistics.discountTotalCents)} />
          <CustomerTypeMetric counts={board.statistics.customerTypeCounts ?? { newCount: 0, returningCount: 0, unmarkedCount: board.statistics.recordCount }} />
          {cashBalance?.enabled && <CashBalanceMetric balance={cashBalance} />}
          <OverviewMetric title="营业额＋现金小费＋刷卡小费－员工应得" label="店铺收入" value={money(board.statistics.storeIncomeCents)} />
          <OverviewMetric title="店铺收入＋店长收入＋经理收入；已加卖卡实收、减礼物卡使用的大费和小费" label="总收入" value={money(board.statistics.totalIncomeCents)} />
        </div>
        <div className="board-mobile-metrics">
        <div className="summary-strip board-key-metrics">
          <OverviewMetric title="折后服务金额＋礼物卡销售实际收款" label="营业额（折扣后）" value={money(board.statistics.revenueCents)} />
          <OverviewMetric title="店铺收入＋店长收入＋经理收入；已加卖卡实收、减礼物卡使用的大费和小费" label="总收入" value={money(board.statistics.totalIncomeCents)} />
        </div>
        <details className="board-summary-details">
          <summary>更多汇总</summary>
          <div className="summary-strip board-extra-metrics">
            <CustomerTypeMetric counts={board.statistics.customerTypeCounts ?? { newCount: 0, returningCount: 0, unmarkedCount: board.statistics.recordCount }} />
            {board.isClosed && board.statistics.recentClosedRevenue && <OverviewMetric label={`过去${board.statistics.recentClosedRevenue.dayCount}天平均营业额`} value={money(board.statistics.recentClosedRevenue.averageCents)} />}
            <OverviewMetric label="折扣总额" value={money(board.statistics.discountTotalCents)} />
            {cashBalance?.enabled && <CashBalanceMetric balance={cashBalance} />}
            <OverviewMetric title="营业额＋现金小费＋刷卡小费－员工应得" label="店铺收入" value={money(board.statistics.storeIncomeCents)} />
          </div>
        </details>
        </div>
      </section>}


      {board.isClosed && <p className="closed-banner" role="status">{canChangeRowVisibility ? "这个营业日已经日结。可隐藏或恢复员工出勤，影响后续生成顺序；修改记工或员工顺序仍须先取消日结。" : "这个营业日已经日结。记工、员工顺序和显示状态均为只读；如需修改请先取消日结。"}</p>}
      {feedback}

      <div className="board-section-heading"><h2>员工记工</h2><span>{visibleRows.length} <span>位员工</span></span></div>
      {employeeRosterActions}
      <section className={visibleRows.length > 0 ? "board board-panel" : "board"} id="today" ref={boardMotion} data-motion-list data-work-record-motion="true" aria-label={isCurrentBusinessDay ? "今日员工记工表" : canManage ? "历史员工记工表" : "我的历史记工表"}>
        {visibleRows.length === 0 && (
          <div className="board-panel board-empty-state empty-state"><strong>{isCurrentBusinessDay ? "今日表格还是空的" : canManage ? "这个营业日没有记工" : "这个营业日没有你的记工"}</strong><p>{showEmployeeClockIn ? "点击上方“上班”，把自己加入今日表格。" : isCurrentBusinessDay ? "店长或经理可以把参与记工的员工加入今日表格。" : canManage ? "可以选择其他营业日继续查看。" : "这里只会显示你自己的历史记录，可以选择其他营业日继续查看。"}</p></div>
        )}
        {visibleRows.map((row) => {
          const entranceIndex = entranceOrder.get(row.id);
          const isCollapsed = collapsed.includes(row.id);
          const hasClockedOut = row.shifts.length > 0 && row.shifts.every(shift => shift.clockOutAt !== null);
          const isOffDuty = !isCurrentBusinessDay || board.isClosed || row.cashSettled || hasClockedOut;
          const activeRecord = isOffDuty ? null : activeWorkRecord(row.workRecords, statusNow);
          const workStatus = row.cashSettled ? t("已结") : isOffDuty
            ? t(isFutureBusinessDay ? "未上班" : "已下班")
            : activeRecord?.endAt ? displayTime(activeRecord.endAt, currentDay.timezone) : t(activeRecord ? "未定" : "空闲");
          const issues = [
            row.workRecords.some(record => hasConfirmedPaymentMismatch(record.status, record.paymentDifferenceCents)) ? t("金额异常") : "",
            board.isClosed && row.cashUnsettled ? t("现金未结") : "",
          ].filter(Boolean).join(" · ");
          const status = issues ? "issue" : isOffDuty ? "off" : activeRecord ? "working" : "available";
          const statusId = `work-status-${row.id}`;
          const activityId = `work-activity-${row.id}`;
          const issueId = `work-issues-${row.id}`;
          const showTotals = canViewEmployeeTotals({
            role: membership.role,
            viewerMembershipId: membership.id,
            rowMembershipId: row.membershipId,
          });
          const workCount = leftTrackRecordCount(row.workRecords);
          return (
            <article className={`employee-row${isCollapsed ? " employee-row--collapsed" : ""}${row.isHidden && canManage ? " employee-row--hidden" : ""}`} key={row.id}
              data-motion-item={row.id} data-motion-skip-in={entranceIndex !== undefined || undefined} data-employee-entrance={entranceIndex !== undefined || undefined} style={entranceIndex === undefined ? undefined : { animationDelay: `${entranceIndex * 50}ms` }}>
              <header className="employee-header">
                <button
                  className="employee-toggle"
                  type="button"
                  onClick={event => {
                    if (!isCollapsed) animateOverlayExit(event.currentTarget.closest(".employee-row")?.querySelector<HTMLElement>(".employee-content"), { backdrop: false, collapse: true });
                    setCollapsed(current => isCollapsed ? current.filter(id => id !== row.id) : [...current, row.id]);
                  }}
                  aria-expanded={!isCollapsed}
                  aria-label={`${row.membership.displayName} · ${t(isCollapsed ? "展开" : "收起")}`}
                  aria-describedby={[activeRecord && activityId, statusId, issues && issueId].filter(Boolean).join(" ")}
                >
                  <span className="employee-status-symbol" data-work-status={status} title={issues || (activeRecord ? t("正在上工") : workStatus)} aria-hidden="true" />
                  <span>
                    <strong>{row.membership.displayName}</strong>
                    {activeRecord && <span hidden id={activityId}>{t("正在上工")}</span>}
                    <small id={statusId} className={row.cashSettled ? "employee-settled" : isOffDuty ? "employee-inactive" : activeRecord ? "on-duty" : "off-duty"}>{workStatus}</small>
                    {issues && <small className="employee-status-issue" id={issueId}>{issues}</small>}
                  </span>
                  {row.isHidden && canManage && <em className="hidden-badge">已隐藏</em>}
                  <span className="chevron" aria-hidden="true">{isCollapsed ? "展开" : "收起"}</span>
                </button>
                <div className="row-tools">
                  {canChangeRowVisibility && <div className="row-actions" role="group" aria-label={`${row.membership.displayName} · ${t("员工操作")}`}>
                    {!board.isClosed && <><button className="row-move-action" type="button" aria-label={t("上移")} title={t("上移")} disabled={busy || board.rows[0]?.id === row.id} onClick={() => run(() => reorder(row.id, -1))}><UiIcon name="arrow-up" /></button><button className="row-move-action" type="button" aria-label={t("下移")} title={t("下移")} disabled={busy || board.rows.at(-1)?.id === row.id} onClick={() => run(() => reorder(row.id, 1))}><UiIcon name="arrow-down" /></button></>}
                    <button type="button" disabled={busy} onClick={event => { const target = event.currentTarget.closest<HTMLElement>(".employee-row"); void run(() => setRowHidden(row, !row.isHidden, target)); }}>{row.isHidden ? "恢复显示" : "隐藏"}</button>
                  </div>}
                  <span className="row-work-count" title="左侧记工数（含占位）" aria-label={`${workCount} 条记工`}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="5" width="14" height="16" rx="2" /><path d="M9 5V3h6v2M9 11h6M9 16h6" /></svg>
                    <strong>{workCount}</strong>
                  </span>
                  {(canManage || row.membershipId === membership.id) && <button className="row-closing-action" type="button" onClick={() => setClosingEmployee({ id: row.membershipId, displayName: row.membership.displayName })}>个人日结</button>}
                </div>
              </header>

              {!isCollapsed && (
                <div className={`employee-content${showTotals ? "" : " employee-content--records-only"}`} data-motion-content>
                  <RecordTrack key={currentDay.businessDate} recordCount={row.workRecords.length} autoReturn={!board.isClosed} movementKey={row.workRecords.map(record => `${record.id}:${record.startAt}:${record.isHighlighted}:${record.isDispatchExcluded}`).join(" ")}>
                    {recordTrackItems(row.workRecords, !board.isClosed && !row.isHidden && (isCurrentBusinessDay || canManage)).map((record, index, items) => {
                      if (record === null) return (
                        <button key="add-record" className="add-record" type="button" data-motion-item="add-record" data-motion-skip-in onClick={() => { setQuickSessionId(crypto.randomUUID()); setRestoredSave(null); setStartTime(currentStoreTime(currentDay.timezone)); setStartTimeValid(true); setQuickServiceId(quickServices[0]?.id ?? ""); setQuickMode("NORMAL"); setQuickCustomerType(null); setQuickEmployeeId(row.membershipId); }}>
                          <span aria-hidden="true"><UiIcon name="plus" /></span>新增记工
                        </button>
                      );
                      if (record.status === "PLACEHOLDER") return (
                        <PlaceholderCard key={record.id} storeId={membership.store.id} record={record} timezone={currentDay.timezone}
                          canDelete={isCurrentBusinessDay || canManage} isClosed={board.isClosed} locked={recordLocked(record.id)}
                          onChanged={onReload} onError={setError} {...recordCardHover} />
                      );
                      const isRightGroup = record.isHighlighted || record.isDispatchExcluded;
                      const hasNote = Boolean(record.note.trim());
                      const hasPaymentMismatch = hasConfirmedPaymentMismatch(
                        record.status,
                        record.paymentDifferenceCents,
                      );
                      const locked = recordLocked(record.id);
                      const unavailable = locked || (!isCurrentBusinessDay && !canManage);
                      const serviceName = record.serviceSnapshot?.shortName ?? "待选项目";
                      const time = `${displayTime(record.startAt, currentDay.timezone)}–${displayTime(record.endAt, currentDay.timezone)}`;
                      return (
                      <div
                        className={`record-card${record.status === "PENDING_PAYMENT" ? " record-card--pending" : ""}${isRightGroup ? " record-card--right-group" : ""}${record.isHighlighted ? " record-card--highlighted" : ""}${hasNote ? " record-card--has-note" : ""}${hasPaymentMismatch ? " record-card--payment-mismatch" : ""}`}
                        key={record.id}
                        data-work-record-id={record.id} data-motion-item={record.id} data-motion-skip-in data-record-status={record.status}
                        style={isRightGroup ? { "--record-stack-layer": items.length - index } as CSSProperties : undefined}
                        {...recordCardHover}
                        data-record-unavailable={unavailable || undefined}
                        title={locked ? "这条记工正在保存或同步，请稍候再试" : unavailable ? "历史记录只读" : undefined}
                      >
                        <button className="record-card__open" type="button" disabled={unavailable} aria-haspopup="dialog"
                          aria-label={`${t("记工详情")} · ${t(serviceName)} · ${time}${hasNote ? ` · ${t("有备注")}` : ""}`}
                          onClick={() => openRecord(record)}>
                          {hasNote && (
                            <span className="record-note-badge" title="有备注">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>
                            </span>
                          )}
                        </button>
                        <span className="record-card__topline">
                          <strong>{serviceName}</strong>
                          <span className="record-card__badges">
                            {record.addonSnapshots.length > 0 && (
                              <button className="record-addon-badge" type="button" disabled={unavailable} aria-haspopup="dialog"
                                aria-label="额外项目" title="额外项目" onClick={() => openRecord(record, "addons")}><span>＋</span></button>
                            )}
                            {record.discountSnapshots.length > 0 && (
                              <button
                                className="record-discount-badge"
                                type="button" disabled={unavailable} aria-haspopup="dialog"
                                aria-label={`折扣 ${money(record.discountTotalCents)}`}
                                title={`折扣 ${money(record.discountTotalCents)}`}
                                onClick={() => openRecord(record, "discounts")}
                              >
                                <span>{discountBadgeText(record.discountTotalCents)}</span>
                              </button>
                            )}
                          </span>
                        </span>
                        {record.customerType && <span className="record-customer-type" data-customer-type={record.customerType}>{record.customerType === "NEW" ? "新客" : "老客"}</span>}
                        <span className="record-time">{time}</span>
                        <button className="record-money" type="button" disabled={unavailable} aria-haspopup="dialog"
                          title="客人付款" onClick={() => openRecord(record, "payment")}>
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
                          {(hasPaymentMismatch || record.status === "PENDING_PAYMENT") && (
                            <span className="record-card__indicators">
                              {hasPaymentMismatch && (
                                <span
                                  className="record-payment-mismatch-badge"
                                  aria-label={`付款差额 ${money(Math.abs(record.paymentDifferenceCents ?? 0))}`}
                                  title="实收服务费与应收金额不一致"
                                >!</span>
                              )}
                              {record.status === "PENDING_PAYMENT" && <span className="record-pending-badge">待结账</span>}
                            </span>
                          )}
                        </button>
                      </div>
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
        <div data-motion-content>{hiddenRows.map((row) => <article key={row.id}><span className="employee-avatar" aria-hidden="true">{row.membership.displayName.slice(0, 1)}</span><div><strong>{row.membership.displayName}</strong><small>{serviceRecordCount(row.workRecords)} 条记工</small></div><button className="primary-action compact" type="button" disabled={busy || !canChangeRowVisibility} onClick={event => { const target = event.currentTarget.closest<HTMLElement>("article"); void run(() => setRowHidden(row, false, target)); }}>恢复显示</button></article>)}</div>
      </section>}

      {quickEmployeeId && createPortal(
        <div className="modal-backdrop modal-backdrop--quick-work" role="presentation">
          <section ref={quickDialogRef} className="quick-modal quick-work-modal" data-work-record-motion="true" data-quick-mode={quickMode} role="dialog" aria-modal="true" aria-labelledby="quick-modal-title">
            <div className="modal-heading">
              <div><p className="eyebrow">快速记工</p><h2 id="quick-modal-title">{members.find((item) => item.id === quickEmployeeId)?.displayName}</h2></div>
              <button className="secondary-action quick-detailed-entry" type="button" disabled={busy || board.isClosed || quickMode === "PLACEHOLDER"} onClick={() => run(async () => openDetailedRecord())}>详细记工</button>
              <button className="close-button" type="button" disabled={busy} onClick={() => setQuickEmployeeId(null)}>关闭</button>
              <div className="modal-heading__actions">
                <QuickWorkModeSwitch value={quickMode} disabled={busy || board.isClosed} onChange={setQuickMode} />
              </div>
            </div>
            <div className="quick-modal-content">
              {restoredSave?.draft.kind === "quick" && <p className="form-error" role="alert">{restoredSave.error}</p>}
              <label className="field-label" htmlFor="start-time">开始时间</label>
              <WorkTimeInput id="start-time" value={startTime} onChange={setStartTime} onValidityChange={setStartTimeValid} />
              {quickMode === "PLACEHOLDER" ? <button className="primary-action quick-placeholder-save" type="button" disabled={busy || board.isClosed} onClick={() => saveQuickRecord("PLACEHOLDER")}>确认</button> : <>
                <div className="quick-service-customer-row">
                  <div className="quick-service-field">
                    <label className="field-label" htmlFor="quick-service">选择项目</label>
                    <select id="quick-service" value={quickService?.id ?? ""} disabled={busy || board.isClosed || quickServices.length === 0} onChange={(event) => setQuickServiceId(event.target.value)}>
                      {quickServices.length === 0 && <option value="">没有可用项目，请先在项目设置中添加。</option>}
                      {quickServices.map((service) => <option key={service.id} value={service.id}>{service.fullName}</option>)}
                    </select>
                  </div>
                  <CustomerTypeSwitch value={quickCustomerType} onChange={setQuickCustomerType} disabled={busy || board.isClosed} />
                </div>
                <fieldset className={`duration-picker${quickDurations.length === 3 ? " duration-picker--three-options" : ""}`} disabled={busy || board.isClosed}>
                  <legend>选择时长</legend>
                  {quickDurations.map((durationMinutes) => (
                    <button key={durationMinutes} type="button" onClick={() => saveQuickRecord(durationMinutes)}>
                      <strong>{durationMinutes} 分钟</strong>
                    </button>
                  ))}
                  {quickDurations.length === 0 && <p className="empty-note">没有可用时长，请先在项目设置中添加。</p>}
                </fieldset>
              </>}
            </div>
          </section>
        </div>,
        document.body,
      )}

      {deletingPlaceholder && <PlaceholderDeleteDialog storeId={membership.store.id} record={deletingPlaceholder}
        employeeName={members.find((member) => member.id === deletingPlaceholder.employeeMembershipId)?.displayName ?? "员工"}
        timezone={currentDay.timezone} canDelete={isCurrentBusinessDay || canManage} isClosed={board.isClosed}
        onClose={() => setDeletingPlaceholder(null)} onChanged={onReload} />}

      {(creatingRecord || editingRecord) && (
        <RecordEditor
          key={editorSessionId} sessionId={editorSessionId} onSubmitSave={submitEditor}
          initialDraft={restoredSave?.draft.kind === "editor" ? restoredSave.draft.fields : undefined}
          initialSaveError={restoredSave?.error}
          initialClosedBusinessDate={restoredSave?.code === "BUSINESS_DAY_CLOSED" ? closedRecordBusinessDate(restoredSave.latestResource, currentDay.businessDate) : null}
          storeId={membership.store.id}
          timezone={currentDay.timezone}
          businessDate={currentDay.businessDate}
          autoDiscountSettings={store}
          record={(creatingRecord ?? editingRecord?.record)!}
          isNew={creatingRecord !== null}
          fullDrawerEntrance={editingRecord !== null}
          initialSection={editingRecord?.section}
          initialServiceItemId={restoredSave?.draft.kind === "editor" ? restoredSave.draft.initialServiceItemId : creatingRecord ? quickService?.id : undefined}
          catalog={catalog}
          members={members}
          canManage={canManage}
          isClosed={board.isClosed}
          onClose={() => { setEditingRecord(null); setCreatingRecord(null); }}
          onSaved={() => undefined}
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
          onSettlementChanged={onSaveReload ?? onReload}
          onClose={() => setClosingEmployee(null)}
        />
      )}
    </>
  );
}
