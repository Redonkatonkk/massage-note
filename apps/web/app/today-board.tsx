"use client";

import { useEffect, useMemo, useState } from "react";
import { ApiError, apiRequest, errorMessage } from "../lib/api";
import { canShowEmployeeClockIn, canViewEmployeeTotals, discountBadgeText } from "../lib/board";
import { financeClosingHref } from "../lib/navigation";
import { businessTimeToIso, currentStoreTime, displayTime } from "../lib/time";
import { activeWorkRecord } from "../lib/work-status";
import type {
  BoardResponse,
  CatalogResponse,
  CurrentBusinessDay,
  MembershipSummary,
  StoreDetails,
  StoreMember,
  WorkRecord,
} from "../lib/types";
import { EmployeeClosingModal } from "./employee-closing";
import { GiftCardSales } from "./gift-card-sales";
import { RecordEditor } from "./record-editor";

interface TodayBoardProps {
  membership: MembershipSummary;
  store: StoreDetails;
  currentDay: CurrentBusinessDay;
  isCurrentBusinessDay: boolean;
  board: BoardResponse;
  catalog: CatalogResponse;
  members: StoreMember[];
  initialRecordId?: string | undefined;
  onInitialRecordOpened?: () => void;
  onReload: () => Promise<void>;
}

function money(cents: number | null): string {
  return cents === null
    ? "未填写"
    : new Intl.NumberFormat("zh-CN", {
        style: "currency",
        currency: "USD",
        minimumFractionDigits: 2,
      }).format(cents / 100);
}

function paymentLabel(record: WorkRecord): string {
  if (record.status === "PENDING_PAYMENT") return "待填写";
  const method = (cash: number, card: number, giftCard: number) => {
    const methods = [
      cash > 0 ? "现金" : null,
      card > 0 ? "刷卡" : null,
      giftCard > 0 ? "礼物卡" : null,
    ].filter(Boolean);
    if (methods.length > 0) return methods.join("＋");
    return "金额为 0";
  };
  const cashService = record.cashServiceCents ?? 0;
  const cardService = record.cardServiceCents ?? 0;
  const giftCardService = record.giftCardServiceCents ?? 0;
  const cashTip = record.cashTipCents ?? 0;
  const cardTip = record.cardTipCents ?? 0;
  const giftCardTip = record.giftCardTipCents ?? 0;
  return `大费：${method(cashService, cardService, giftCardService)} · 小费：${method(cashTip, cardTip, giftCardTip)}`;
}

export function TodayBoard({
  membership,
  store,
  currentDay,
  isCurrentBusinessDay,
  board,
  catalog,
  members,
  initialRecordId,
  onInitialRecordOpened,
  onReload,
}: TodayBoardProps) {
  const canManage = membership.role !== "EMPLOYEE";
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [showHidden, setShowHidden] = useState(false);
  const [quickEmployeeId, setQuickEmployeeId] = useState<string | null>(null);
  const initialService = catalog.serviceItems.find(
    (item) => item.isEnabled && !item.deletedAt && item.priceOptions.length > 0,
  );
  const [selectedService, setSelectedService] = useState(initialService?.id ?? "");
  const [selectedServiceDuration, setSelectedServiceDuration] = useState(
    initialService?.priceOptions[0]?.durationMinutes.toString() ?? "",
  );
  const [quickMode, setQuickMode] = useState<"PRESET" | "CUSTOM">("PRESET");
  const [quickHighlighted, setQuickHighlighted] = useState(false);
  const [customServiceName, setCustomServiceName] = useState("");
  const [customServiceShortName, setCustomServiceShortName] = useState("");
  const [customServiceAmount, setCustomServiceAmount] = useState("");
  const [customServiceDuration, setCustomServiceDuration] = useState("");
  const [startTime, setStartTime] = useState(currentStoreTime(currentDay.timezone));
  const [editingRecord, setEditingRecord] = useState<WorkRecord | null>(null);
  const [closingEmployee, setClosingEmployee] = useState<{ id: string; displayName: string } | null>(null);
  const [addMemberId, setAddMemberId] = useState("");
  const [draggingRowId, setDraggingRowId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [statusNow, setStatusNow] = useState(() => {
    const serverTime = Date.parse(currentDay.serverTime);
    return Number.isFinite(serverTime) ? serverTime : Date.now();
  });

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (!initialRecordId) return;
    const row = board.rows.find((candidate) =>
      candidate.workRecords.some((record) => record.id === initialRecordId),
    );
    const record = row?.workRecords.find((candidate) => candidate.id === initialRecordId);
    if (row && record) {
      setCollapsed((current) => current.filter((id) => id !== row.id));
      if (row.isHidden) setShowHidden(true);
      setEditingRecord(record);
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

  const activeServices = useMemo(
    () => catalog.serviceItems.filter(
      (item) => item.isEnabled && !item.deletedAt && item.priceOptions.length > 0,
    ),
    [catalog.serviceItems],
  );

  useEffect(() => {
    setSelectedService((current) =>
      activeServices.some((item) => item.id === current)
        ? current
        : (activeServices[0]?.id ?? ""),
    );
  }, [activeServices]);

  const selectedServiceItem = activeServices.find(
    (item) => item.id === selectedService,
  );

  useEffect(() => {
    setSelectedServiceDuration((current) =>
      selectedServiceItem?.priceOptions.some(
        (option) => option.durationMinutes.toString() === current,
      )
        ? current
        : (selectedServiceItem?.priceOptions[0]?.durationMinutes.toString() ?? ""),
    );
  }, [selectedServiceItem]);

  const visibleRows = useMemo(
    () => board.rows.filter((row) => !row.isHidden || !canManage || showHidden),
    [board.rows, canManage, showHidden],
  );
  const hiddenRows = useMemo(
    () => canManage ? board.rows.filter((row) => row.isHidden) : [],
    [board.rows, canManage],
  );
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
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  async function setRowHidden(row: BoardResponse["rows"][number], isHidden: boolean) {
    const path = `/stores/${membership.store.id}/boards/${currentDay.businessDate}/rows/${row.id}`;
    try {
      await apiRequest(path, { method: "PATCH", idempotent: true, body: { version: row.version, isHidden } });
    } catch (caught) {
      const latest = caught instanceof ApiError && caught.code === "BOARD_ROW_VERSION_CONFLICT"
        ? caught.latestResource as { version?: unknown } | undefined
        : undefined;
      if (typeof latest?.version !== "number") throw caught;
      await apiRequest(path, { method: "PATCH", idempotent: true, body: { version: latest.version, isHidden } });
    }
    setNotice(isHidden ? `已隐藏 ${row.membership.displayName}` : `已恢复 ${row.membership.displayName}`);
    await onReload();
  }

  async function saveQuickRecord() {
    if (!quickEmployeeId) return;
    let serviceSelection:
      | { serviceItemId: string; serviceDurationMinutes: number }
      | {
          customService: {
            name: string;
            shortName: string;
            amountCents: number;
            durationMinutes: number;
          };
        };
    if (quickMode === "PRESET") {
      if (!selectedService) throw new Error("请选择一个预设项目");
      const durationMinutes = Number(selectedServiceDuration);
      if (!Number.isInteger(durationMinutes)) throw new Error("请选择项目时长");
      serviceSelection = {
        serviceItemId: selectedService,
        serviceDurationMinutes: durationMinutes,
      };
    } else {
      const amountText = customServiceAmount.trim();
      const amount = Number(amountText);
      const amountCents = Math.round(amount * 100);
      const durationMinutes = Number(customServiceDuration);
      if (!customServiceName.trim()) throw new Error("请填写自定义项目名称");
      if (!customServiceShortName.trim()) throw new Error("请填写自定义项目简称");
      if (
        !/^\d+(?:\.\d{1,2})?$/.test(amountText) ||
        !Number.isSafeInteger(amountCents) ||
        amountCents < 0
      ) {
        throw new Error("项目金额请填写非负数，最多保留两位小数");
      }
      if (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 720) {
        throw new Error("项目时长必须是 1 至 720 分钟的整数");
      }
      serviceSelection = {
        customService: {
          name: customServiceName.trim(),
          shortName: customServiceShortName.trim(),
          amountCents,
          durationMinutes,
        },
      };
    }
    await apiRequest(`/stores/${membership.store.id}/work-records`, {
      method: "POST",
      idempotent: true,
      body: {
        employeeMembershipId: quickEmployeeId,
        startAt: businessTimeToIso(
          currentDay.businessDate,
          startTime,
          currentDay.timezone,
          currentDay.businessCutoffLocal,
        ),
        isHighlighted: quickHighlighted,
        ...serviceSelection,
      },
    });
    setQuickEmployeeId(null);
    setQuickMode("PRESET");
    setQuickHighlighted(false);
    setCustomServiceName("");
    setCustomServiceShortName("");
    setCustomServiceAmount("");
    setCustomServiceDuration("");
    setNotice("记工已保存，可稍后打开详情填写付款");
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

  async function dropRow(targetRowId: string) {
    if (!draggingRowId || draggingRowId === targetRowId) return;
    const rowIds = board.rows.map((row) => row.id);
    const source = rowIds.indexOf(draggingRowId);
    const target = rowIds.indexOf(targetRowId);
    if (source < 0 || target < 0) return;
    rowIds.splice(target, 0, rowIds.splice(source, 1)[0]!);
    setDraggingRowId(null);
    await saveRowOrder(rowIds);
  }

  return (
    <>
      {canManage && <section className="summary-strip" aria-label="今日全店汇总">
        <div><span>大费总额（折扣前）</span><strong>{money(board.statistics.grossFeeBaseCents)}</strong></div>
        <div><span>小费总额</span><strong>{money(board.statistics.totalTipCents)}</strong></div>
        <div><span>折扣总额</span><strong>{money(board.statistics.discountTotalCents)}</strong></div>
        <div><span>礼物卡销售</span><strong>{money(board.statistics.giftCardSalesAmountCents)}</strong></div>
        <div title="大费总额－折扣总额＋小费总额－员工应得＋礼物卡销售"><span>店铺收入</span><strong>{money(board.statistics.storeIncomeCents)}</strong></div>
      </section>}

      <section className="board-toolbar" aria-label="今日操作">
        <div>
          <button className="secondary-action" type="button" disabled={busy} onClick={() => run(onReload)}>刷新</button>
          {showEmployeeClockIn && <button className="primary-action" type="button" disabled={busy} onClick={() => run(async () => {
            await apiRequest(`/stores/${membership.store.id}/shifts/clock-in`, { method: "POST", idempotent: true, body: {} });
            setNotice("已上班，并加入今日表格");
            await onReload();
          })}>{busy ? "正在上班…" : "上班"}</button>}
          {canManage && <a className="primary-action board-closing-action" href={financeClosingHref(membership.store.id, currentDay.businessDate)}>{board.isClosed ? "查看全店日结" : "全店日结"}</a>}
        </div>
      </section>

      {hiddenRows.length > 0 && <section className="hidden-rows-panel" aria-label="已隐藏员工管理">
        <header><div><strong>已隐藏员工 · {hiddenRows.length}</strong><p>隐藏只影响表格显示，不会删除记工。可在这里直接恢复。</p></div><button className="secondary-action compact" type="button" onClick={() => setShowHidden((value) => !value)}>{showHidden ? "收起隐藏内容" : "查看隐藏内容"}</button></header>
        <div>{hiddenRows.map((row) => <article key={row.id}><span className="employee-avatar" aria-hidden="true">{row.membership.displayName.slice(0, 1)}</span><div><strong>{row.membership.displayName}</strong><small>{row.workRecords.length} 条记工</small></div><button className="primary-action compact" type="button" disabled={busy} onClick={() => run(() => setRowHidden(row, false))}>恢复显示</button></article>)}</div>
      </section>}

      {board.isClosed && <p className="closed-banner" role="status">这个营业日已经日结。记工和结算内容只读；店长或经理仍可调整员工行显示，如需修改其他内容请先取消日结。</p>}
      {notice && <p className="success-banner" role="status">✓ {notice}</p>}
      {error && <p className="form-error" role="alert">{error}</p>}

      <section className="board" id="today" aria-label={isCurrentBusinessDay ? "今日员工记工表" : canManage ? "历史员工记工表" : "我的历史记工表"}>
        {visibleRows.length === 0 && (
          <div className="empty-state"><strong>{isCurrentBusinessDay ? "今日表格还是空的" : canManage ? "这个营业日没有记工" : "这个营业日没有你的记工"}</strong><p>{showEmployeeClockIn ? "点击上方“上班”，把自己加入今日表格。" : isCurrentBusinessDay ? "店长或经理可以把参与记工的员工加入今日表格。" : canManage ? "可以选择其他营业日继续查看。" : "这里只会显示你自己的历史记录，可以选择其他营业日继续查看。"}</p></div>
        )}
        {visibleRows.map((row) => {
          const isCollapsed = collapsed.includes(row.id);
          const activeRecord = isCurrentBusinessDay
            ? activeWorkRecord(row.workRecords, statusNow)
            : null;
          const workStatus = activeRecord
            ? `下工时间 · ${activeRecord.endAt ? displayTime(activeRecord.endAt, currentDay.timezone) : "未定"}`
            : "空闲";
          const showTotals = canViewEmployeeTotals({
            role: membership.role,
            viewerMembershipId: membership.id,
            rowMembershipId: row.membershipId,
          });
          return (
            <article className={`employee-row${row.isHidden && canManage ? " employee-row--hidden" : ""}${draggingRowId === row.id ? " employee-row--dragging" : ""}`} key={row.id} onDragOver={canManage && !board.isClosed ? (event) => event.preventDefault() : undefined} onDrop={canManage && !board.isClosed ? () => void run(() => dropRow(row.id)) : undefined}>
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
                {(canManage || row.membershipId === membership.id) && (
                  <div className="row-tools">
                    {canManage && <>
                      {!board.isClosed && <><span className="drag-handle" draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; setDraggingRowId(row.id); }} onDragEnd={() => setDraggingRowId(null)} title="按住并拖动整行排序">拖动排序</span><button type="button" disabled={busy || board.rows[0]?.id === row.id} onClick={() => run(() => reorder(row.id, -1))}>上移</button><button type="button" disabled={busy || board.rows.at(-1)?.id === row.id} onClick={() => run(() => reorder(row.id, 1))}>下移</button></>}
                      <button type="button" disabled={busy} onClick={() => run(() => setRowHidden(row, !row.isHidden))}>{row.isHidden ? "恢复显示" : "隐藏"}</button>
                    </>}
                    {(canManage || row.membershipId === membership.id) && <button className="row-closing-action" type="button" onClick={() => setClosingEmployee({ id: row.membershipId, displayName: row.membership.displayName })}>个人日结</button>}
                  </div>
                )}
              </header>

              {!isCollapsed && (
                <div className={`employee-content${showTotals ? "" : " employee-content--records-only"}`}>
                  <div className="record-track">
                    {row.workRecords.map((record) => (
                      <button
                        className={`record-card${record.status === "PENDING_PAYMENT" ? " record-card--pending" : ""}${record.isHighlighted ? " record-card--highlighted" : ""}`}
                        key={record.id}
                        type="button"
                        disabled={!isCurrentBusinessDay && !canManage}
                        title={!isCurrentBusinessDay && !canManage ? "历史记录只读" : undefined}
                        onClick={() => setEditingRecord(record)}
                      >
                        <span className="record-card__topline">
                          <strong>{record.serviceSnapshot?.shortName ?? "项目"}</strong>
                          <span className="record-card__badges">
                            {record.isHighlighted && <span className="record-highlight-badge" aria-label="高亮记工" title="高亮记工">★</span>}
                            {record.discountSnapshots.length > 0 && (
                              <span
                                className="record-discount-badge"
                                aria-label={`折扣 ${money(record.discountTotalCents)}`}
                                title={`折扣 ${money(record.discountTotalCents)}`}
                              >
                                {discountBadgeText(record.discountTotalCents)}
                              </span>
                            )}
                            {record.status === "PENDING_PAYMENT" && <em>待结账</em>}
                          </span>
                        </span>
                        <span className="record-time">{displayTime(record.startAt, currentDay.timezone)}–{displayTime(record.endAt, currentDay.timezone)}</span>
                        <span className="record-money"><b>{money(record.grossFeeBaseCents)}</b><small>小费 {money(record.totalTipCents)}</small></span>
                        <span className="record-meta">{paymentLabel(record)}{record.addonSnapshots.length > 0 && " · 有加项"}</span>
                      </button>
                    ))}
                    {!board.isClosed && !row.isHidden && (isCurrentBusinessDay || canManage) && (
                      <button className="add-record" type="button" onClick={() => { setStartTime(currentStoreTime(currentDay.timezone)); setQuickMode("PRESET"); setQuickHighlighted(false); setQuickEmployeeId(row.membershipId); }}>
                        <span aria-hidden="true">＋</span>新增记工
                      </button>
                    )}
                  </div>
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

      {(canManage || isCurrentBusinessDay) && <GiftCardSales
        storeId={membership.store.id}
        businessDate={currentDay.businessDate}
        sales={board.giftCardSales}
        nextSerialNumber={board.nextGiftCardSerialNumber}
        discountSettings={store}
        members={members}
        defaultOperatorMembershipId={membership.id}
        canEdit={!board.isClosed && (isCurrentBusinessDay || canManage)}
        onReload={onReload}
      />}

      {canManage && availableMembers.length > 0 && !board.isClosed && (
        <section className="add-employee-panel">
          <label className="field-label">手动添加员工到今日表格
            <select value={addMemberId} onChange={(event) => setAddMemberId(event.target.value)}>
              <option value="">请选择员工</option>
              {availableMembers.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}
            </select>
          </label>
          <button className="secondary-action" type="button" disabled={!addMemberId || busy} onClick={() => run(async () => {
            await apiRequest(`/stores/${membership.store.id}/boards/${currentDay.businessDate}/rows`, { method: "POST", idempotent: true, body: { membershipId: addMemberId } });
            setAddMemberId("");
            setNotice("员工已加入今日表格");
            await onReload();
          })}>添加员工</button>
        </section>
      )}

      {quickEmployeeId && (
        <div className="modal-backdrop" role="presentation">
          <section className="quick-modal" role="dialog" aria-modal="true" aria-labelledby="quick-modal-title">
            <div className="modal-heading">
              <div><p className="eyebrow">快速记工</p><h2 id="quick-modal-title">{members.find((item) => item.id === quickEmployeeId)?.displayName}</h2></div>
              <div className="modal-heading__actions">
                <button className={`highlight-toggle${quickHighlighted ? " active" : ""}`} type="button" aria-pressed={quickHighlighted} onClick={() => setQuickHighlighted((current) => !current)}><span aria-hidden="true">★</span>{quickHighlighted ? "已高亮" : "高亮标记"}</button>
                <button className="close-button" type="button" onClick={() => setQuickEmployeeId(null)}>关闭</button>
              </div>
            </div>
            <label className="field-label" htmlFor="start-time">开始时间</label>
            <input className="time-input" id="start-time" type="time" value={startTime} onChange={(event) => setStartTime(event.target.value)} />
            <div className="quick-mode-switch" role="group" aria-label="项目类型">
              <button className={quickMode === "PRESET" ? "active" : ""} type="button" onClick={() => setQuickMode("PRESET")}>预设项目</button>
              <button className={quickMode === "CUSTOM" ? "active" : ""} type="button" onClick={() => setQuickMode("CUSTOM")}>＋ 自定义项目</button>
            </div>
            {quickMode === "PRESET" ? (
              <div className="quick-preset-fields">
                <fieldset className="service-picker">
                  <legend>选择项目</legend>
                  {activeServices.map((service) => (
                    <label key={service.id}><input type="radio" name="service" checked={selectedService === service.id} onChange={() => setSelectedService(service.id)} /><span><strong>{service.shortName}</strong><small>{service.fullName}</small></span></label>
                  ))}
                  {activeServices.length === 0 && <p className="empty-note">没有启用中的预设项目，可切换到自定义项目。</p>}
                </fieldset>
                {selectedServiceItem && (
                  <fieldset className="service-picker duration-picker">
                    <legend>选择时长与价格</legend>
                    {selectedServiceItem.priceOptions.map((option) => (
                      <label key={option.id}><input type="radio" name="service-duration" checked={selectedServiceDuration === option.durationMinutes.toString()} onChange={() => setSelectedServiceDuration(option.durationMinutes.toString())} /><span><strong>{option.durationMinutes} 分钟</strong><small>{money(option.priceCents)}</small></span></label>
                    ))}
                  </fieldset>
                )}
              </div>
            ) : (
              <div className="quick-custom-grid">
                <label className="field-label">项目名称<input autoFocus maxLength={120} value={customServiceName} onChange={(event) => setCustomServiceName(event.target.value)} /></label>
                <label className="field-label">项目简称<input maxLength={30} value={customServiceShortName} onChange={(event) => setCustomServiceShortName(event.target.value)} /></label>
                <label className="field-label">金额（美元）<input inputMode="decimal" placeholder="例如 80.00" value={customServiceAmount} onChange={(event) => setCustomServiceAmount(event.target.value)} /></label>
                <label className="field-label">时长（分钟）<input type="number" min="1" max="720" inputMode="numeric" placeholder="例如 60" value={customServiceDuration} onChange={(event) => setCustomServiceDuration(event.target.value)} /></label>
                <p className="field-help">自定义项目无需审批，提成按该员工默认比例；未设置时使用全店默认比例。系统会保留审计记录。</p>
              </div>
            )}
            <p className="modal-note">保存后先显示为浅橙色“待结账”，付款和小费可以稍后补充。</p>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="save-record" type="button" disabled={busy || (quickMode === "PRESET" && (!selectedService || !selectedServiceDuration))} onClick={() => run(saveQuickRecord)}>{busy ? "正在保存…" : "保存记工"}</button>
          </section>
        </div>
      )}

      {editingRecord && (
        <RecordEditor
          storeId={membership.store.id}
          timezone={currentDay.timezone}
          businessDate={currentDay.businessDate}
          autoDiscountSettings={store}
          record={editingRecord}
          catalog={catalog}
          members={members}
          canManage={canManage}
          onClose={() => setEditingRecord(null)}
          onSaved={() => setNotice("记工修改已保存")}
          onChanged={onReload}
        />
      )}

      {closingEmployee && (
        <EmployeeClosingModal
          storeId={membership.store.id}
          businessDate={currentDay.businessDate}
          membershipId={closingEmployee.id}
          displayName={closingEmployee.displayName}
          onClose={() => setClosingEmployee(null)}
        />
      )}
    </>
  );
}
