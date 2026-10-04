"use client";

import { useAutoDismissState } from "../use-auto-dismiss-state";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiRequest, errorMessage } from "../../lib/api";
import { groupEmployeeSettlementRecordsByDay, type EmployeeSettlementDaySummary } from "../../lib/employee-settlement";
import { generateEmployeeSettlementImage, type GeneratedSettlementImage } from "../../lib/employee-settlement-image";
import { formatUsdPrecise } from "../../lib/money";
import type { EmployeeSettlementCalendar, EmployeeSettlementDelivery, EmployeeSettlementDeliveryList, EmployeeSettlementPaymentScope, EmployeeSettlementPreview, PayrollSettlement, StoreMember } from "../../lib/types";
import { payrollAmountCents } from "../../lib/payroll-settlement";
import { selectSettlementDate, type SettlementDateRange } from "../../lib/settlement-calendar";
import { SettlementCalendar } from "./settlement-calendar";
import { SettlementSummary } from "./settlement-summary";
import { useLanguage } from "../language-provider";
import { dateOnly } from "./date-utils";
import { MobileDataCard, RecordFacts, ResponsiveDataView } from "../ui/responsive-data-view";

const money = (value: number) => formatUsdPrecise(value);
const scopeLabel = (scope: EmployeeSettlementPaymentScope) => scope === "CASH" ? "现金" : scope === "NON_CASH" ? "刷卡＋礼物卡" : "全部";
const time = (value: string | null, timezone: string) => value ? new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)) : "—";
const recordName = (record: EmployeeSettlementPreview["records"][number]) => [record.serviceShortName || record.serviceName, ...record.addons.map((item) => item.shortName || item.name)].join(" ＋ ");

function tipPaymentParts(record: EmployeeSettlementPreview["records"][number]) {
  const values = [["现金", record.cashTipCents], ["刷卡", record.cardTipCents], ["礼物卡", record.giftCardTipCents]] as const;
  return values.filter(([, value]) => value > 0).map(([label, value]) => `${label} ${money(value)}`).join(" / ") || "—";
}

function paymentNotice(record: EmployeeSettlementPreview["records"][number], scope: EmployeeSettlementPaymentScope) {
  const hasCash = record.cashServiceCents > 0 || record.cashTipCents > 0;
  const hasNonCash = record.nonCashServiceCents > 0 || record.nonCashTipCents > 0;
  if (!hasCash || !hasNonCash) return null;
  if (scope === "CASH") return "包含非现金付款 · 本结算仅计算现金部分";
  if (scope === "NON_CASH") return "包含现金付款 · 本结算仅计算刷卡＋礼物卡部分";
  return "现金＋非现金混合付款";
}

function DeliveryHistoryModal({ value, busy, action, close }: { value: EmployeeSettlementDeliveryList | null; busy: boolean; action: (delivery: EmployeeSettlementDelivery, kind: "cancel" | "retry" | "retry-detail") => void; close: () => void }) {
  const stage = (item: EmployeeSettlementDelivery) => {
    if (item.status === "SENT") return "全部完成";
    if (item.status === "FAILED") return "长图发送失败";
    if (item.status === "CANCELLED") return "已取消";
    if (item.detailSentAt) return "长图已发送";
    return item.status === "CLAIMED" ? "正在发送长图" : "长图待发送";
  };
  const deliveryAction = (item: EmployeeSettlementDelivery) => item.status === "QUEUED" ? <button className="table-action danger" type="button" disabled={busy} onClick={() => action(item, "cancel")}>取消</button> : item.status === "FAILED" ? <button className="table-action" type="button" disabled={busy} onClick={() => action(item, "retry")}>重试长图</button> : item.status === "SENT" ? <button className="table-action" type="button" disabled={busy} onClick={() => action(item, "retry-detail")}>重发长图</button> : null;
  return (
    <div className="modal-backdrop settlement-delivery-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="settlement-delivery-modal" role="dialog" aria-modal="true" aria-labelledby="settlement-delivery-title">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">短信发送</p>
            <h2 id="settlement-delivery-title">发送记录</h2>
            <p>查看长图发送进度，并处理失败或需要重发的任务。</p>
          </div>
          <button className="close-button" type="button" onClick={close} aria-label="关闭短信发送记录">关闭</button>
        </div>
        {!value ? <p className="empty-state">正在读取发送记录…</p> : value.deliveries.length === 0 ? <p className="empty-state">还没有短信发送记录。</p> : (
          <ResponsiveDataView desktop={<div className="table-scroll settlement-delivery-table">
            <table className="data-table">
              <thead><tr><th>员工</th><th>区间</th><th>分类</th><th>附件进度</th><th>接收号码</th><th>尝试</th><th>错误</th><th>操作</th></tr></thead>
              <tbody>{value.deliveries.map((item) => <tr key={item.id}><td>{item.membership?.displayName ?? "员工小计汇总"}</td><td>{dateOnly(item.periodStart)} 至 {dateOnly(item.periodEnd)}</td><td>{scopeLabel(item.paymentScope)}</td><td><span className={`delivery-row-status is-${item.status.toLowerCase()}`}>{stage(item)}</span></td><td>{item.recipientPhoneE164}</td><td>{item.attemptCount}</td><td>{item.lastError || "—"}</td><td>{deliveryAction(item) ?? "—"}</td></tr>)}</tbody>
            </table>
          </div>}>
            <ul className="mobile-data-list">{value.deliveries.map(item => <li key={item.id}><MobileDataCard title={item.membership?.displayName ?? "员工小计汇总"} subtitle={`${dateOnly(item.periodStart)} 至 ${dateOnly(item.periodEnd)}`} status={<span className={`delivery-row-status is-${item.status.toLowerCase()}`}>{stage(item)}</span>} actions={deliveryAction(item)}>
              <RecordFacts items={[{ label: "工资来源", value: scopeLabel(item.paymentScope) }, { label: "接收号码", value: item.recipientPhoneE164 }, { label: "尝试", value: item.attemptCount }]} />
              {item.lastError && <p className="form-error">{item.lastError}</p>}
            </MobileDataCard></li>)}</ul>
          </ResponsiveDataView>
        )}
      </section>
    </div>
  );
}

function localizedBusinessDate(value: string, locale: "zh-CN" | "en-US") {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function SettlementRecordCard({
  preview,
  record,
  index,
}: {
  preview: EmployeeSettlementPreview;
  record: EmployeeSettlementPreview["records"][number];
  index: number;
}) {
  const { locale } = useLanguage();
  const cash = preview.paymentScope === "CASH";
  const single = preview.paymentScope !== "ALL";
  const notice = paymentNotice(record, preview.paymentScope);
  const largeFeeWage = cash ? record.cashLargeFeeWageCents : record.nonCashLargeFeeWageCents;
  const tip = cash ? record.cashTipCents : record.nonCashTipCents;
  const selectedIncome = cash ? record.cashIncomeCents : record.nonCashIncomeCents;

  return (
    <article className="employee-settlement-record-card">
      <div className="employee-settlement-record-card__topline">
        <div>
          <strong>{recordName(record)}</strong>
          <span className="record-time">{time(record.startAt, preview.storeTimezone)}–{time(record.endAt, preview.storeTimezone)}</span>
        </div>
        <span>{locale === "en-US" ? `#${index + 1}` : `第 ${index + 1} 笔`}</span>
      </div>
      <div className="employee-settlement-record-card__payments">
        <span><small>大费基数</small><b>{money(record.grossFeeBaseCents)}</b></span>
        <span><small>小费</small><b>{tipPaymentParts(record)}</b></span>
      </div>
      {notice && <small className="settlement-payment-notice">{notice}</small>}
      <dl className="employee-settlement-record-card__income">
        {single ? <>
          <div><dt>大费工资</dt><dd>{money(largeFeeWage)}</dd></div>
          <div><dt>所选小费</dt><dd>{money(tip)}</dd></div>
          <div className="total"><dt>本笔收入</dt><dd>{money(selectedIncome)}</dd></div>
        </> : <>
          <div><dt>现金收入</dt><dd>{money(record.cashIncomeCents)}</dd></div>
          <div><dt>刷卡＋礼卡收入</dt><dd>{money(record.nonCashIncomeCents)}</dd></div>
          <div className="total"><dt>本笔总收入</dt><dd>{money(record.totalIncomeCents)}</dd></div>
        </>}
      </dl>
    </article>
  );
}

function SettlementDaySummaryCard({
  paymentScope,
  summary,
}: {
  paymentScope: EmployeeSettlementPaymentScope;
  summary: EmployeeSettlementDaySummary;
}) {
  const { locale } = useLanguage();
  const cash = paymentScope === "CASH";
  const total = paymentScope === "ALL"
    ? summary.totalIncomeCents
    : cash
      ? summary.cashIncomeCents
      : summary.nonCashIncomeCents;

  return (
    <article className="employee-settlement-record-card employee-settlement-record-card--summary">
      <div className="employee-settlement-record-card__topline">
        <strong>当日总结</strong>
        <span>{locale === "en-US" ? `${summary.recordCount} records` : `${summary.recordCount} 笔`}</span>
      </div>
      <div className="employee-settlement-record-card__amount">
        <small>{paymentScope === "ALL" ? "当日总收入" : cash ? "现金工资合计" : "非现金工资合计"}</small>
        <strong>{money(total)}</strong>
      </div>
      <dl className="employee-settlement-record-card__daily-summary">
        <div><dt>大费基数</dt><dd>{money(summary.grossFeeBaseCents)}</dd></div>
        {paymentScope === "ALL" ? <>
          <div><dt>现金收入</dt><dd>{money(summary.cashIncomeCents)}</dd></div>
          <div><dt>刷卡＋礼卡收入</dt><dd>{money(summary.nonCashIncomeCents)}</dd></div>
        </> : <>
          <div><dt>{cash ? "现金大费工资" : "刷卡＋礼卡大费工资"}</dt><dd>{money(cash ? summary.cashLargeFeeWageCents : summary.nonCashLargeFeeWageCents)}</dd></div>
          <div><dt>{cash ? "现金小费" : "刷卡＋礼卡小费"}</dt><dd>{money(cash ? summary.cashTipCents : summary.nonCashTipCents)}</dd></div>
        </>}
      </dl>
    </article>
  );
}

function SettlementRecords({ preview }: { preview: EmployeeSettlementPreview }) {
  const { locale } = useLanguage();
  const days = groupEmployeeSettlementRecordsByDay(preview.records);
  const countLabel = locale === "en-US"
    ? `${days.length} days · ${preview.records.length} records`
    : `${days.length} 天 · ${preview.records.length} 笔`;

  return (
    <section className="employee-settlement-records">
      <header>
        <div>
          <h3>按日记工</h3>
          <p>每天先展示当日总结，再按时间排列记工。</p>
        </div>
        <strong>{countLabel}</strong>
      </header>
      {days.length > 0 ? (
        <div className="employee-settlement-days">
          {days.map((day) => (
            <section className="employee-settlement-day" key={day.businessDate}>
              <header>
                <div>
                  <time dateTime={day.businessDate}>{localizedBusinessDate(day.businessDate, locale)}</time>
                  <span>{day.businessDate}</span>
                </div>
                <strong>{locale === "en-US" ? `${day.records.length} records` : `${day.records.length} 笔记工`}</strong>
              </header>
              <div className="employee-settlement-day-track" aria-label={locale === "en-US" ? `${day.businessDate} records and summary` : `${day.businessDate} 记工与总结`}>
                <SettlementDaySummaryCard paymentScope={preview.paymentScope} summary={day.summary} />
                {day.records.map((record, index) => (
                  <SettlementRecordCard key={record.id} preview={preview} record={record} index={index} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="empty-state">当前范围没有符合条件的已确认记工。</p>
      )}
    </section>
  );
}

export function EmployeeSettlementPanel({ storeId, businessDate, members, settlements, busy, run, onSettled }: { storeId: string; businessDate: string; members: StoreMember[]; settlements: PayrollSettlement[]; busy: boolean; run: (action: () => Promise<void>) => Promise<void>; onSettled: () => Promise<void> }) {
  const payable = members.filter((member) => member.status === "ACTIVE" && !member.deletedAt);
  const [membershipId, setMembershipId] = useState(payable[0]?.id ?? "");
  const [range, setRange] = useState<SettlementDateRange>({ dateFrom: `${businessDate.slice(0, 8)}01`, dateTo: businessDate, selectingEnd: false });
  const { dateFrom, dateTo } = range;
  const [month, setMonth] = useState(businessDate.slice(0, 7));
  const [calendar, setCalendar] = useState<EmployeeSettlementCalendar | null>(null);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarError, setCalendarError] = useAutoDismissState("");
  const [calendarFailed, setCalendarFailed] = useState(false);
  const [calendarEpoch, setCalendarEpoch] = useState(0);
  const [deduction, setDeduction] = useState("0");
  const [paymentScope, setPaymentScope] = useState<EmployeeSettlementPaymentScope>("ALL");
  const [preview, setPreview] = useState<EmployeeSettlementPreview | null>(null);
  const [deliveries, setDeliveries] = useState<EmployeeSettlementDeliveryList | null>(null);
  const [deliveryHistoryOpen, setDeliveryHistoryOpen] = useState(false);
  const [sendMessage, setSendMessage] = useAutoDismissState("");
  const [sending, setSending] = useState(false);
  const { locale, t } = useLanguage();
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatedImage, setGeneratedImage] = useState<GeneratedSettlementImage | null>(null);
  const [imageError, setImageError] = useAutoDismissState("");
  const [imageMessage, setImageMessage] = useAutoDismissState("");
  const imageRequest = useRef(0);
  const imageGenerating = useRef(false);
  const localeRef = useRef(locale);
  localeRef.current = locale;

  const registering = useRef(false);
  const payrollRequest = useRef<{ payload: string; key: string } | null>(null);
  const previewRequest = useRef(0);
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const selectionKey = JSON.stringify({ storeId, membershipId, dateFrom, dateTo, paymentScope });
  const selectionRef = useRef(selectionKey);
  selectionRef.current = selectionKey;
  useEffect(() => {
    if (!payable.some((member) => member.id === membershipId)) {
      setMembershipId(payable[0]?.id ?? "");
      setPreview(null);
      setDeduction("0");
    }
  }, [members, membershipId]);
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    setCalendar(null);
    setCalendarError("");
    setCalendarFailed(false);
    if (!membershipId) { setCalendarLoading(false); return; }
    setCalendarLoading(true);
    const params = new URLSearchParams({ membershipId, month });
    void apiRequest<EmployeeSettlementCalendar>(`/stores/${storeId}/employee-settlements/calendar?${params}`, { signal: abort.signal })
      .then((result) => { if (active) setCalendar(result); })
      .catch((error) => { if (active) { setCalendarError(errorMessage(error)); setCalendarFailed(true); } })
      .finally(() => { if (active) setCalendarLoading(false); });
    return () => { active = false; abort.abort(); };
  }, [storeId, membershipId, month, settlements, calendarEpoch]);
  useEffect(() => () => { previewRequest.current++; imageRequest.current++; }, []);
  useEffect(() => { imageRequest.current++; setGeneratedImage(null); setImageError(""); setImageMessage(""); }, [preview, locale]);
  useEffect(() => () => { if (generatedImage) URL.revokeObjectURL(generatedImage.url); }, [generatedImage]);
  function clearPreview() {
    previewRequest.current++;
    setPreview(null);
    setDeduction("0");
    setSendMessage("");
  }
  const loadDeliveries = useCallback(async () => setDeliveries(await apiRequest<EmployeeSettlementDeliveryList>(`/stores/${storeId}/employee-settlements/deliveries`)), [storeId]);
  useEffect(() => { void loadDeliveries().catch(() => undefined); }, [loadDeliveries]);
  useEffect(() => { if (!deliveries?.deliveries.some((item) => item.status === "QUEUED" || item.status === "CLAIMED")) return; const timer = window.setInterval(() => void loadDeliveries().catch(() => undefined), 10_000); return () => window.clearInterval(timer); }, [deliveries, loadDeliveries]);
  useEffect(() => { if (!deliveryHistoryOpen) return; const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setDeliveryHistoryOpen(false); }; window.addEventListener("keydown", closeOnEscape); return () => window.removeEventListener("keydown", closeOnEscape); }, [deliveryHistoryOpen]);
  const generate = useCallback(async () => {
    if (!membershipId || !dateTo) return;
    const request = ++previewRequest.current;
    const selected = JSON.stringify({ storeId, membershipId, dateFrom, dateTo, paymentScope });
    const params = new URLSearchParams({ membershipId, dateFrom, dateTo, paymentScope });
    const result = await apiRequest<EmployeeSettlementPreview>(`/stores/${storeId}/employee-settlements/preview?${params}`);
    if (previewRequest.current === request && selectionRef.current === selected) setPreview(result);
  }, [storeId, membershipId, dateFrom, dateTo, paymentScope]);
  // Ledger edits/deletion/restoration refresh both payment totals and calendar marks.
  useEffect(() => {
    if (previewRef.current) {
      const selected = selectionRef.current;
      void generate().catch(() => { if (selectionRef.current === selected) setPreview(null); });
    }
  }, [settlements, generate]);
  const alreadyRegistered = preview?.payment?.fullyConfirmed ?? false;
  const isOwnerPreview = members.find((member) => member.id === preview?.employee.membershipId)?.role === "OWNER";
  let deductionCents: number | null = null;
  try { deductionCents = payrollAmountCents(deduction); } catch { /* Show validation next to the input. */ }
  const invalidDeduction = deductionCents === null || deductionCents > (preview?.payment?.unsettledCents ?? 0);
  const paidCents = !invalidDeduction && preview?.payment ? preview.payment.unsettledCents - deductionCents! : null;
  function settle() {
    if (!preview?.payment || busy || registering.current || alreadyRegistered || isOwnerPreview || preview.records.length === 0 || invalidDeduction) return;
    registering.current = true;
    const currentPreview = preview;
    const selected = selectionKey;
    const body = { membershipId: preview.employee.membershipId, dateFrom: preview.dateFrom, dateTo: preview.dateTo, paymentScope: preview.paymentScope, deductionCents, revision: preview.payment.revision };
    const payload = JSON.stringify(body);
    void run(async () => {
      try {
        if (payrollRequest.current?.payload !== payload) payrollRequest.current = { payload, key: crypto.randomUUID() };
        await apiRequest(`/stores/${storeId}/employee-settlements/confirm`, {
          method: "POST", body, headers: { "Idempotency-Key": payrollRequest.current.key },
        });
        if (selectionRef.current === selected) {
          setPreview({ ...currentPreview, payment: { ...currentPreview.payment!, fullyConfirmed: true, unsettledCents: 0 } });
          setDeduction("0");
        }
        await onSettled();
        setCalendarEpoch((value) => value + 1);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409 && selectionRef.current === selected) {
          clearPreview();
          setCalendarEpoch((value) => value + 1);
        }
        throw error;
      } finally {
        registering.current = false;
      }
    });
  }
  async function send() { setSending(true); setSendMessage("正在加入短信发送队列…"); try { const result = await apiRequest<{ queuedCount?: number }>(`/stores/${storeId}/employee-settlements/deliveries`, { method: "POST", idempotent: true, body: { membershipId, dateFrom, dateTo, paymentScope } }); await loadDeliveries(); setSendMessage(result.queuedCount ? `已加入短信发送队列（${result.queuedCount} 条），可点发送记录查看进度。` : "发送任务已更新，可点发送记录查看进度。"); } catch (error) { setSendMessage(`发送失败：${errorMessage(error)}`); throw error; } finally { setSending(false); } }
  async function createImage() {
    if (!preview || preview.records.length === 0 || imageGenerating.current) return;
    imageGenerating.current = true;
    setGeneratingImage(true);
    setImageError("");
    setImageMessage("");
    const request = ++imageRequest.current;
    const selected = selectionKey;
    try {
      const image = await generateEmployeeSettlementImage(preview, locale);
      if (request === imageRequest.current && selectionRef.current === selected && previewRef.current === preview && localeRef.current === locale) {
        setGeneratedImage(image);
        setImageMessage("图片已生成，请在下方预览或保存。");
      } else URL.revokeObjectURL(image.url);
    } catch (error) {
      if (request === imageRequest.current && selectionRef.current === selected) setImageError(errorMessage(error));
    } finally {
      imageGenerating.current = false;
      setGeneratingImage(false);
    }
  }
  const deliveryAction = (delivery: EmployeeSettlementDelivery, kind: "cancel" | "retry" | "retry-detail") => void run(async () => {
    if (kind === "cancel") {
      if (!window.confirm("确认取消这条结算短信任务？")) return;
      await apiRequest(`/stores/${storeId}/employee-settlements/deliveries/${delivery.id}`, { method: "DELETE" });
    } else {
      const endpoint = kind === "retry-detail" ? "retry-detail" : "retry";
      await apiRequest(`/stores/${storeId}/employee-settlements/deliveries/${delivery.id}/${endpoint}`, { method: "POST", idempotent: true });
    }
    await loadDeliveries();
  });
  return (
    <section className="employee-settlement-builder">
      <div className="employee-settlement-builder-heading"><div><p className="eyebrow">员工结算区</p><h2>生成区间结算单</h2><p>选择员工和日期范围，结算单始终包含已结与未结记录。</p></div></div>
      <div className={`settlement-selection-layout${preview ? " has-preview" : ""}${payable.length > 6 ? " has-many-employees" : ""}`}>
        <div className="settlement-selection-sidebar">
          <div className="settlement-employee-buttons" role="group" aria-label="选择员工">{payable.map((member) => <button key={member.id} type="button" disabled={busy || sending} aria-pressed={membershipId === member.id} className={membershipId === member.id ? "is-selected" : ""} onClick={() => { setMembershipId(member.id); clearPreview(); }}>{member.displayName}</button>)}</div>
          <form className="employee-settlement-controls settlement-calendar-controls" onSubmit={(event) => { event.preventDefault(); setDeduction("0"); void run(generate); }}>
            <label>工资来源<select disabled={busy || sending || !dateTo} value={paymentScope} onChange={(event) => { setPaymentScope(event.target.value as EmployeeSettlementPaymentScope); clearPreview(); }}><option value="CASH">现金</option><option value="NON_CASH">刷卡＋礼物卡</option><option value="ALL">全部</option></select></label>
            <button className="primary-action" type="submit" disabled={busy || sending || !membershipId || !dateTo}>生成结算单</button>
          </form>
        </div>
        <div className="settlement-calendar-column">
          {payable.length === 0 ? <p className="empty-state">没有可查看的在职成员。</p> : <SettlementCalendar month={month} range={range} data={calendar?.membershipId === membershipId && calendar.month === month ? calendar : null} loading={calendarLoading} error={calendarError} failed={calendarFailed} disabled={busy || sending} onMonth={setMonth} onDate={(date) => { setRange((current) => selectSettlementDate(current, date)); clearPreview(); }} retry={() => setCalendarEpoch((value) => value + 1)} />}
        </div>
        {preview && <section className="employee-settlement-preview settlement-preview-compact" aria-label="结算单汇总">
          <header>
            <div><p className="eyebrow">{preview.storeName} · 员工区间结算</p><h2>{preview.employee.displayName}</h2><p>{preview.dateFrom} 至 {preview.dateTo} · {scopeLabel(preview.paymentScope)} · {preview.records.length} 笔</p></div>
          </header>
          <SettlementSummary preview={preview} />
          {!isOwnerPreview && preview.payment && <section className="settlement-payment" aria-label="付款登记">
            <div className="settlement-payment-amounts">
              <article><span>本次未结金额</span><strong>{money(preview.payment.unsettledCents)}</strong></article>
              <label>抵扣金额（美元）<input disabled={busy || sending || alreadyRegistered || preview.records.length === 0} inputMode="decimal" value={deduction} aria-invalid={invalidDeduction} onChange={(event) => setDeduction(event.target.value)} /></label>
              <article><span>本次实付金额</span><strong>{paidCents === null ? "—" : money(paidCents)}</strong></article>
            </div>
            <details className="settlement-payment-note"><summary>抵扣说明</summary><p>抵扣此前已付金额；此前付款应已登记到账本或现金结算中。本次只登记实付金额，并确认所选日期和来源结清。</p></details>
            {invalidDeduction && <p role="alert">抵扣金额需精确到美分，且不能超过本次未结金额。</p>}
          </section>}
          <div className="employee-settlement-preview-actions settlement-preview-footer">
            <div className="employee-settlement-send-actions">
              {!isOwnerPreview && preview.payment && <button className="primary-action" type="button" disabled={busy || sending || alreadyRegistered || preview.records.length === 0 || invalidDeduction} onClick={settle}>{alreadyRegistered ? "已确认结清" : "已付款"}</button>}
              <button className="secondary-action" type="button" disabled={busy || sending || generatingImage || preview.records.length === 0} onClick={() => void createImage()}>{generatingImage ? "正在生成…" : "生成图片"}</button>
              <button className="secondary-action" type="button" disabled={busy || sending || preview.records.length === 0} onClick={() => void run(send)}>{sending ? "正在排队…" : "短信发送长图"}</button>
              <button className="secondary-action settlement-history-button" type="button" onClick={() => setDeliveryHistoryOpen(true)}>发送记录 <span>{deliveries?.deliveries.length ?? 0}</span></button>
            </div>
            {sendMessage && <p className="employee-settlement-send-message" role="status">{sendMessage}</p>}
            {imageError && <p className="employee-settlement-send-message" role="alert">{t(imageError)}</p>}
            {imageMessage && <p className="employee-settlement-send-message" role="status">{imageMessage}</p>}
          </div>
        </section>}
      </div>
      {preview && <section className="employee-settlement-preview">
        <SettlementRecords preview={preview} />
        {generatedImage && <figure className="employee-closing-image-preview">
          <img src={generatedImage.url} alt={t("员工区间结算图片预览")} />
          <figcaption>图片包含汇总和全部按日记工明细。</figcaption>
          <a className="secondary-action" href={generatedImage.url} download={generatedImage.fileName}>保存图片</a>
        </figure>}
      </section>}
      {deliveryHistoryOpen && <DeliveryHistoryModal value={deliveries} busy={busy} action={deliveryAction} close={() => setDeliveryHistoryOpen(false)} />}
    </section>
  );
}
