"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, errorMessage } from "../../lib/api";
import { groupEmployeeSettlementRecordsByDay, type EmployeeSettlementDaySummary } from "../../lib/employee-settlement";
import { formatUsdPrecise } from "../../lib/money";
import type { EmployeeSettlementDelivery, EmployeeSettlementDeliveryList, EmployeeSettlementPaymentScope, EmployeeSettlementPreview, StoreMember } from "../../lib/types";
import { useLanguage } from "../language-provider";

const money = (value: number) => formatUsdPrecise(value);
const dateOnly = (value: string) => value.slice(0, 10);
const scopeLabel = (scope: EmployeeSettlementPaymentScope) => scope === "CASH" ? "现金" : scope === "NON_CASH" ? "刷卡＋礼物卡" : "全部";
const shiftDate = (value: string, days: number) => { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
const time = (value: string | null, timezone: string) => value ? new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)) : "—";
const recordName = (record: EmployeeSettlementPreview["records"][number]) => [record.serviceShortName || record.serviceName, ...record.addons.map((item) => item.shortName || item.name)].join(" ＋ ");

function paymentParts(record: EmployeeSettlementPreview["records"][number], kind: "service" | "tip") {
  const values = kind === "service"
    ? [["现金", record.cashServiceCents], ["刷卡", record.cardServiceCents], ["礼物卡", record.giftCardServiceCents]] as const
    : [["现金", record.cashTipCents], ["刷卡", record.cardTipCents], ["礼物卡", record.giftCardTipCents]] as const;
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
          <div className="table-scroll settlement-delivery-table">
            <table className="data-table">
              <thead><tr><th>员工</th><th>区间</th><th>分类</th><th>附件进度</th><th>接收号码</th><th>尝试</th><th>错误</th><th>操作</th></tr></thead>
              <tbody>{value.deliveries.map((item) => <tr key={item.id}><td>{item.membership.displayName}</td><td>{dateOnly(item.periodStart)} 至 {dateOnly(item.periodEnd)}</td><td>{scopeLabel(item.paymentScope)}</td><td><span className={`delivery-row-status is-${item.status.toLowerCase()}`}>{stage(item)}</span></td><td>{item.recipientPhoneE164}</td><td>{item.attemptCount}</td><td>{item.lastError || "—"}</td><td>{item.status === "QUEUED" ? <button className="table-action danger" type="button" disabled={busy} onClick={() => action(item, "cancel")}>取消</button> : item.status === "FAILED" ? <button className="table-action" type="button" disabled={busy} onClick={() => action(item, "retry")}>重试长图</button> : item.status === "SENT" ? <button className="table-action" type="button" disabled={busy} onClick={() => action(item, "retry-detail")}>重发长图</button> : "—"}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function SettlementSummary({ preview }: { preview: EmployeeSettlementPreview }) {
  const summary = preview.summary;
  if (preview.paymentScope === "CASH") return <div className="employee-settlement-summary mode-single"><article><span>现金大费工资</span><strong>{money(summary.cashLargeFeeWageCents)}</strong></article><article><span>现金小费</span><strong>{money(summary.cashTipCents)}</strong></article><article className="total"><span>现金工资合计</span><strong>{money(summary.cashIncomeCents)}</strong></article></div>;
  if (preview.paymentScope === "NON_CASH") return <div className="employee-settlement-summary mode-single"><article><span>刷卡＋礼卡大费工资</span><strong>{money(summary.nonCashLargeFeeWageCents)}</strong></article><article><span>刷卡＋礼卡小费</span><strong>{money(summary.nonCashTipCents)}</strong></article><article className="total"><span>非现金工资合计</span><strong>{money(summary.nonCashIncomeCents)}</strong></article></div>;
  return <div className="employee-settlement-summary mode-all"><div className="employee-settlement-matrix"><span /><b>现金</b><b>刷卡＋礼卡</b><b>合计</b><strong>大费工资</strong><span>{money(summary.cashLargeFeeWageCents)}</span><span>{money(summary.nonCashLargeFeeWageCents)}</span><span>{money(summary.cashLargeFeeWageCents + summary.nonCashLargeFeeWageCents)}</span><strong>小费工资</strong><span>{money(summary.cashTipCents)}</span><span>{money(summary.nonCashTipCents)}</span><span>{money(summary.cashTipCents + summary.nonCashTipCents)}</span></div><article className="total"><span>区间总收入</span><strong>{money(summary.totalIncomeCents)}</strong></article></div>;
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
        <strong>{recordName(record)}</strong>
        <span>{locale === "en-US" ? `#${index + 1}` : `第 ${index + 1} 笔`}</span>
      </div>
      <span className="record-time">
        {time(record.startAt, preview.storeTimezone)}–{time(record.endAt, preview.storeTimezone)}
      </span>
      <div className="employee-settlement-record-card__amount">
        <small>大费基数</small>
        <strong>{money(record.grossFeeBaseCents)}</strong>
      </div>
      <div className="employee-settlement-record-card__payments">
        <span><small>大费实收</small><b>{paymentParts(record, "service")}</b></span>
        <span><small>小费</small><b>{paymentParts(record, "tip")}</b></span>
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
      <span className="record-time">本日合计</span>
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
          <p>每天按时间排列记工，末尾卡片汇总当天收入。</p>
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
                {day.records.map((record, index) => (
                  <SettlementRecordCard key={record.id} preview={preview} record={record} index={index} />
                ))}
                <SettlementDaySummaryCard paymentScope={preview.paymentScope} summary={day.summary} />
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

export function EmployeeSettlementPanel({ storeId, businessDate, members, busy, run }: { storeId: string; businessDate: string; members: StoreMember[]; busy: boolean; run: (action: () => Promise<void>) => Promise<void> }) {
  const payable = members.filter((member) => member.status === "ACTIVE" && !member.deletedAt);
  const [membershipId, setMembershipId] = useState(payable[0]?.id ?? "");
  const [dateFrom, setDateFrom] = useState(shiftDate(businessDate, -6));
  const [dateTo, setDateTo] = useState(businessDate);
  const [paymentScope, setPaymentScope] = useState<EmployeeSettlementPaymentScope>("ALL");
  const [preview, setPreview] = useState<EmployeeSettlementPreview | null>(null);
  const [deliveries, setDeliveries] = useState<EmployeeSettlementDeliveryList | null>(null);
  const [deliveryHistoryOpen, setDeliveryHistoryOpen] = useState(false);
  const [sendMessage, setSendMessage] = useState("");
  const [sending, setSending] = useState(false);
  const loadDeliveries = useCallback(async () => setDeliveries(await apiRequest<EmployeeSettlementDeliveryList>(`/stores/${storeId}/employee-settlements/deliveries`)), [storeId]);
  useEffect(() => { void loadDeliveries().catch(() => undefined); }, [loadDeliveries]);
  useEffect(() => { if (!deliveries?.deliveries.some((item) => item.status === "QUEUED" || item.status === "CLAIMED")) return; const timer = window.setInterval(() => void loadDeliveries().catch(() => undefined), 10_000); return () => window.clearInterval(timer); }, [deliveries, loadDeliveries]);
  useEffect(() => { if (!deliveryHistoryOpen) return; const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setDeliveryHistoryOpen(false); }; window.addEventListener("keydown", closeOnEscape); return () => window.removeEventListener("keydown", closeOnEscape); }, [deliveryHistoryOpen]);
  async function generate() { const params = new URLSearchParams({ membershipId, dateFrom, dateTo, paymentScope }); setPreview(await apiRequest<EmployeeSettlementPreview>(`/stores/${storeId}/employee-settlements/preview?${params}`)); }
  async function send() { setSending(true); setSendMessage("正在加入短信发送队列…"); try { const result = await apiRequest<{ queuedCount?: number }>(`/stores/${storeId}/employee-settlements/deliveries`, { method: "POST", idempotent: true, body: { membershipId, dateFrom, dateTo, paymentScope } }); await loadDeliveries(); setSendMessage(result.queuedCount ? `已加入短信发送队列（${result.queuedCount} 条），可点发送记录查看进度。` : "发送任务已更新，可点发送记录查看进度。"); } catch (error) { setSendMessage(`发送失败：${errorMessage(error)}`); throw error; } finally { setSending(false); } }
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
      <div className="employee-settlement-builder-heading"><div><p className="eyebrow">员工结算区</p><h2>生成区间结算单</h2><p>核对并发送结算资料，不会新增工资账本，也不会改变老板尚欠余额。</p></div></div>
      <form className="employee-settlement-controls" onSubmit={(event) => { event.preventDefault(); void run(generate); }}>
        <label>员工<select required value={membershipId} onChange={(event) => { setMembershipId(event.target.value); setPreview(null); setSendMessage(""); }}>{payable.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label>
        <label>开始日期<input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPreview(null); setSendMessage(""); }} /></label>
        <label>结束日期<input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPreview(null); setSendMessage(""); }} /></label>
        <label>工资来源<select value={paymentScope} onChange={(event) => { setPaymentScope(event.target.value as EmployeeSettlementPaymentScope); setPreview(null); setSendMessage(""); }}><option value="CASH">现金</option><option value="NON_CASH">刷卡＋礼物卡</option><option value="ALL">全部</option></select></label>
        <button className="primary-action" type="submit" disabled={busy || !membershipId}>生成结算单</button>
      </form>
      {preview && <section className="employee-settlement-preview">
        <header>
          <div><p className="eyebrow">{preview.storeName} · 员工区间结算</p><h2>{preview.employee.displayName}</h2><p>{preview.dateFrom} 至 {preview.dateTo} · {scopeLabel(preview.paymentScope)} · {preview.records.length} 笔</p></div>
          <div className="employee-settlement-preview-actions">
            <div className="employee-settlement-send-actions">
              <button className="secondary-action" type="button" disabled={busy || sending || preview.records.length === 0} onClick={() => void run(send)}>{sending ? "正在排队…" : "短信发送长图"}</button>
              <button className="secondary-action settlement-history-button" type="button" onClick={() => setDeliveryHistoryOpen(true)}>发送记录 <span>{deliveries?.deliveries.length ?? 0}</span></button>
            </div>
            {sendMessage && <p className="employee-settlement-send-message" role="status">{sendMessage}</p>}
          </div>
        </header>
        <SettlementSummary preview={preview} />
        <SettlementRecords preview={preview} />
      </section>}
      {deliveryHistoryOpen && <DeliveryHistoryModal value={deliveries} busy={busy} action={deliveryAction} close={() => setDeliveryHistoryOpen(false)} />}
    </section>
  );
}
