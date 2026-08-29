"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../lib/api";
import { formatUsd } from "../../lib/money";
import type { EmployeeSettlementDelivery, EmployeeSettlementDeliveryList, EmployeeSettlementPaymentScope, EmployeeSettlementPreview, StoreMember } from "../../lib/types";

const money = (value: number) => formatUsd(value);
const dateOnly = (value: string) => value.slice(0, 10);
const scopeLabel = (scope: EmployeeSettlementPaymentScope) => scope === "CASH" ? "现金" : scope === "NON_CASH" ? "刷卡＋礼物卡" : "全部";
const shiftDate = (value: string, days: number) => { const date = new Date(`${value}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10); };
const time = (value: string | null, timezone: string) => value ? new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)) : "—";
const recordName = (record: EmployeeSettlementPreview["records"][number]) => [record.serviceShortName || record.serviceName, ...record.addons.map((item) => item.shortName || item.name)].join(" ＋ ");

function DeliveryQueue({ value, busy, action }: { value: EmployeeSettlementDeliveryList; busy: boolean; action: (delivery: EmployeeSettlementDelivery, kind: "cancel" | "retry" | "retry-detail") => void }) {
  if (value.deliveries.length === 0) return null;
  const stage = (item: EmployeeSettlementDelivery) => {
    if (item.status === "SENT") return "全部完成";
    if (item.status === "FAILED") return item.summarySentAt ? "摘要已发 · PDF 失败" : "发送失败";
    if (item.status === "CANCELLED") return "已取消";
    if (item.detailSentAt) return "PDF 已发送";
    if (item.summarySentAt) return "摘要已发 · PDF 待发送";
    return item.status === "CLAIMED" ? "正在发送摘要" : "摘要待发送";
  };
  return <details className="settlement-delivery-queue"><summary>短信发送记录 <strong>{value.deliveries.length}</strong></summary><div className="table-scroll"><table className="data-table"><thead><tr><th>员工</th><th>区间</th><th>分类</th><th>附件进度</th><th>接收号码</th><th>尝试</th><th>错误</th><th>操作</th></tr></thead><tbody>{value.deliveries.map((item) => <tr key={item.id}><td>{item.membership.displayName}</td><td>{dateOnly(item.periodStart)} 至 {dateOnly(item.periodEnd)}</td><td>{scopeLabel(item.paymentScope)}</td><td><span className={`delivery-row-status is-${item.status.toLowerCase()}`}>{stage(item)}</span></td><td>{item.recipientPhoneE164}</td><td>{item.attemptCount}</td><td>{item.lastError || "—"}</td><td>{item.status === "QUEUED" ? <button className="table-action danger" type="button" disabled={busy} onClick={() => action(item, "cancel")}>取消</button> : item.status === "FAILED" ? <button className="table-action" type="button" disabled={busy} onClick={() => action(item, "retry")}>重试未完成附件</button> : item.status === "SENT" ? <button className="table-action" type="button" disabled={busy} onClick={() => action(item, "retry-detail")}>仅重发 PDF</button> : "—"}</td></tr>)}</tbody></table></div></details>;
}

function SettlementSummary({ preview }: { preview: EmployeeSettlementPreview }) {
  const summary = preview.summary;
  if (preview.paymentScope === "CASH") return <div className="employee-settlement-summary mode-single"><article><span>现金大费工资</span><strong>{money(summary.cashLargeFeeWageCents)}</strong></article><article><span>现金小费</span><strong>{money(summary.cashTipCents)}</strong></article><article className="total"><span>现金工资合计</span><strong>{money(summary.cashIncomeCents)}</strong></article></div>;
  if (preview.paymentScope === "NON_CASH") return <div className="employee-settlement-summary mode-single"><article><span>刷卡＋礼卡大费工资</span><strong>{money(summary.nonCashLargeFeeWageCents)}</strong></article><article><span>刷卡＋礼卡小费</span><strong>{money(summary.nonCashTipCents)}</strong></article><article className="total"><span>非现金工资合计</span><strong>{money(summary.nonCashIncomeCents)}</strong></article></div>;
  return <div className="employee-settlement-summary mode-all"><div className="employee-settlement-matrix"><span /><b>现金</b><b>刷卡＋礼卡</b><b>合计</b><strong>大费工资</strong><span>{money(summary.cashLargeFeeWageCents)}</span><span>{money(summary.nonCashLargeFeeWageCents)}</span><span>{money(summary.cashLargeFeeWageCents + summary.nonCashLargeFeeWageCents)}</span><strong>小费工资</strong><span>{money(summary.cashTipCents)}</span><span>{money(summary.nonCashTipCents)}</span><span>{money(summary.cashTipCents + summary.nonCashTipCents)}</span></div><article className="total"><span>区间总收入</span><strong>{money(summary.totalIncomeCents)}</strong></article></div>;
}

function SettlementRecords({ preview }: { preview: EmployeeSettlementPreview }) {
  const single = preview.paymentScope !== "ALL";
  const cash = preview.paymentScope === "CASH";
  return <section className="employee-settlement-records"><header><div><h3>逐笔记工</h3><p>仅统计付款已确认记工；列表最多支持 999 笔。</p></div><strong>{preview.records.length} 条</strong></header><div className="employee-settlement-record-scroll"><table className="data-table employee-settlement-record-table"><thead><tr><th>日期／时间</th><th>项目／加项</th><th>大费基数</th>{single ? <><th>所选付款实收</th><th>所选大费工资</th><th>所选小费</th><th>本笔所选收入</th></> : <><th>现金收入</th><th>刷卡＋礼卡收入</th><th>本笔总收入</th></>}</tr></thead><tbody>{preview.records.map((record) => <tr key={record.id}><td><strong>{record.businessDate}</strong><small>{time(record.startAt, preview.storeTimezone)}–{time(record.endAt, preview.storeTimezone)}</small></td><td>{recordName(record)}</td><td>{money(record.grossFeeBaseCents)}</td>{single ? <><td>{money(cash ? record.cashServiceCents : record.nonCashServiceCents)}</td><td>{money(cash ? record.cashLargeFeeWageCents : record.nonCashLargeFeeWageCents)}</td><td>{money(cash ? record.cashTipCents : record.nonCashTipCents)}</td><td><strong>{money(cash ? record.cashIncomeCents : record.nonCashIncomeCents)}</strong></td></> : <><td>{money(record.cashIncomeCents)}</td><td>{money(record.nonCashIncomeCents)}</td><td><strong>{money(record.totalIncomeCents)}</strong></td></>}</tr>)}</tbody></table>{preview.records.length === 0 && <p className="empty-state">当前范围没有符合条件的已确认记工。</p>}</div></section>;
}

export function EmployeeSettlementPanel({ storeId, businessDate, members, busy, run }: { storeId: string; businessDate: string; members: StoreMember[]; busy: boolean; run: (action: () => Promise<void>) => Promise<void> }) {
  const payable = members.filter((member) => member.status === "ACTIVE" && !member.deletedAt);
  const [membershipId, setMembershipId] = useState(payable[0]?.id ?? "");
  const [dateFrom, setDateFrom] = useState(shiftDate(businessDate, -6));
  const [dateTo, setDateTo] = useState(businessDate);
  const [paymentScope, setPaymentScope] = useState<EmployeeSettlementPaymentScope>("ALL");
  const [preview, setPreview] = useState<EmployeeSettlementPreview | null>(null);
  const [deliveries, setDeliveries] = useState<EmployeeSettlementDeliveryList | null>(null);
  const loadDeliveries = useCallback(async () => setDeliveries(await apiRequest<EmployeeSettlementDeliveryList>(`/stores/${storeId}/employee-settlements/deliveries`)), [storeId]);
  useEffect(() => { void loadDeliveries().catch(() => undefined); }, [loadDeliveries]);
  useEffect(() => { if (!deliveries?.deliveries.some((item) => item.status === "QUEUED" || item.status === "CLAIMED")) return; const timer = window.setInterval(() => void loadDeliveries().catch(() => undefined), 10_000); return () => window.clearInterval(timer); }, [deliveries, loadDeliveries]);
  async function generate() { const params = new URLSearchParams({ membershipId, dateFrom, dateTo, paymentScope }); setPreview(await apiRequest<EmployeeSettlementPreview>(`/stores/${storeId}/employee-settlements/preview?${params}`)); }
  async function send() { await apiRequest(`/stores/${storeId}/employee-settlements/deliveries`, { method: "POST", idempotent: true, body: { membershipId, dateFrom, dateTo, paymentScope } }); await loadDeliveries(); }
  return <section className="employee-settlement-builder"><div className="employee-settlement-builder-heading"><div><p className="eyebrow">员工结算区</p><h2>生成区间结算单</h2><p>核对并发送结算资料，不会新增工资账本，也不会改变老板尚欠余额。</p></div></div><form className="employee-settlement-controls" onSubmit={(event) => { event.preventDefault(); void run(generate); }}><label>员工<select required value={membershipId} onChange={(event) => { setMembershipId(event.target.value); setPreview(null); }}>{payable.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label><label>开始日期<input type="date" value={dateFrom} onChange={(event) => { setDateFrom(event.target.value); setPreview(null); }} /></label><label>结束日期<input type="date" value={dateTo} onChange={(event) => { setDateTo(event.target.value); setPreview(null); }} /></label><label>工资来源<select value={paymentScope} onChange={(event) => { setPaymentScope(event.target.value as EmployeeSettlementPaymentScope); setPreview(null); }}><option value="CASH">现金</option><option value="NON_CASH">刷卡＋礼物卡</option><option value="ALL">全部</option></select></label><button className="primary-action" type="submit" disabled={busy || !membershipId}>生成结算单</button></form>{preview && <section className="employee-settlement-preview"><header><div><p className="eyebrow">{preview.storeName} · 员工区间结算</p><h2>{preview.employee.displayName}</h2><p>{preview.dateFrom} 至 {preview.dateTo} · {scopeLabel(preview.paymentScope)} · {preview.records.length} 笔</p></div><button className="secondary-action" type="button" disabled={busy || preview.records.length === 0} onClick={() => void run(send)}>短信发送摘要图＋PDF</button></header><SettlementSummary preview={preview} /><SettlementRecords preview={preview} /></section>}{deliveries && <DeliveryQueue value={deliveries} busy={busy} action={(delivery, kind) => void run(async () => { if (kind === "cancel") { if (!window.confirm("确认取消这条结算短信任务？")) return; await apiRequest(`/stores/${storeId}/employee-settlements/deliveries/${delivery.id}`, { method: "DELETE" }); } else { const endpoint = kind === "retry-detail" ? "retry-detail" : "retry"; await apiRequest(`/stores/${storeId}/employee-settlements/deliveries/${delivery.id}/${endpoint}`, { method: "POST", idempotent: true }); } await loadDeliveries(); })} />}</section>;
}
