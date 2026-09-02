"use client";

import { useCallback, useEffect, useState } from "react";
import { apiRequest, errorMessage } from "../../lib/api";
import { formatEffectiveCommissionRate } from "../../lib/employee-subtotal";
import { formatUsdPrecise } from "../../lib/money";
import type { EmployeeSettlementDelivery, EmployeeSettlementDeliveryList, FinanceSummaryResponse } from "../../lib/types";

type EmployeeSubtotal = FinanceSummaryResponse["employees"][number];

const money = (value: number) => formatUsdPrecise(value);
const dateOnly = (value: string) => value.slice(0, 10);
const paymentLabel = (value: FinanceSummaryResponse["filters"]["paymentMethod"]) => value === "CASH" ? "现金" : value === "NON_CASH" ? "刷卡＋礼物卡" : "全部付款";
const amountLabel = (value: FinanceSummaryResponse["filters"]["amountType"]) => value === "SERVICE" ? "仅大费" : value === "TIP" ? "仅小费" : "大费＋小费";

function deliveryStage(item: EmployeeSettlementDelivery) {
  if (item.status === "SENT") return "发送完成";
  if (item.status === "FAILED") return "发送失败";
  if (item.status === "CANCELLED") return "已取消";
  return item.status === "CLAIMED" ? "正在发送" : "等待发送";
}

function EmployeeSummaryDeliveryHistory({
  value,
  busy,
  action,
  close,
}: {
  value: EmployeeSettlementDeliveryList | null;
  busy: boolean;
  action: (delivery: EmployeeSettlementDelivery, kind: "cancel" | "retry" | "retry-detail") => void;
  close: () => void;
}) {
  return (
    <div className="modal-backdrop settlement-delivery-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
      <section className="settlement-delivery-modal" role="dialog" aria-modal="true" aria-labelledby="employee-summary-delivery-title">
        <div className="modal-heading">
          <div>
            <p className="eyebrow">员工小计短信</p>
            <h2 id="employee-summary-delivery-title">发送记录</h2>
            <p>每次发送都保存当时的筛选范围、接收号码和员工小计快照。</p>
          </div>
          <button className="close-button" type="button" onClick={close}>关闭</button>
        </div>
        {!value ? <p className="empty-state">正在读取发送记录…</p> : value.deliveries.length === 0 ? <p className="empty-state">还没有员工小计发送记录。</p> : (
          <div className="table-scroll settlement-delivery-table">
            <table className="data-table">
              <thead><tr><th>区间</th><th>付款范围</th><th>接收号码</th><th>状态</th><th>尝试</th><th>错误</th><th>操作</th></tr></thead>
              <tbody>{value.deliveries.map((item) => (
                <tr key={item.id}>
                  <td>{dateOnly(item.periodStart)} 至 {dateOnly(item.periodEnd)}</td>
                  <td>{paymentLabel(item.paymentScope)}</td>
                  <td>{item.recipientPhoneE164}</td>
                  <td><span className={`delivery-row-status is-${item.status.toLowerCase()}`}>{deliveryStage(item)}</span></td>
                  <td>{item.attemptCount}</td>
                  <td>{item.lastError || "—"}</td>
                  <td>{item.status === "QUEUED"
                    ? <button className="table-action danger" type="button" disabled={busy} onClick={() => action(item, "cancel")}>取消</button>
                    : item.status === "FAILED"
                      ? <button className="table-action" type="button" disabled={busy} onClick={() => action(item, "retry")}>重试</button>
                      : item.status === "SENT"
                        ? <button className="table-action" type="button" disabled={busy} onClick={() => action(item, "retry-detail")}>重发</button>
                        : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function EmployeeSubtotalCard({ row, onViewDetails }: { row: EmployeeSubtotal; onViewDetails: (label: string) => void }) {
  const amount = (value: number, label: string, emphasis = false) => (
    <button className={`employee-subtotal-value${emphasis ? " is-emphasis" : ""}`} type="button" aria-label={`${row.displayName}${label}${money(value)}，查看组成明细`} onClick={() => onViewDetails(`${row.displayName}${label}`)}>
      <small>{label}</small>
      <strong>{money(value)}</strong>
    </button>
  );
  return (
    <article className="employee-subtotal-card">
      <header>
        <div><span>员工小计</span><h3>{row.displayName}</h3></div>
        <button type="button" onClick={() => onViewDetails(`${row.displayName}项目数量`)}>{row.recordCount} 单</button>
      </header>
      <div className="employee-subtotal-equation employee-subtotal-equation--base">
        {amount(row.mainServiceAmountCents, "主要项目")}
        <b aria-hidden="true">＋</b>
        {amount(row.addonTotalCents, "加项")}
        <b aria-hidden="true">＝</b>
        {amount(row.grossFeeBaseCents, "大费基数", true)}
      </div>
      <div className="employee-subtotal-equation employee-subtotal-equation--wage">
        {amount(row.grossFeeBaseCents, "大费基数")}
        <b aria-hidden="true">×</b>
        <div className="employee-subtotal-rate"><small>综合分成比例</small><strong>{formatEffectiveCommissionRate(row.grossFeeBaseCents, row.totalLargeFeeWageCents)}</strong></div>
        <b aria-hidden="true">＝</b>
        {amount(row.totalLargeFeeWageCents, "大费工资", true)}
      </div>
      <div className="employee-subtotal-equation employee-subtotal-equation--income">
        {amount(row.totalLargeFeeWageCents, "大费工资")}
        <b aria-hidden="true">＋</b>
        {amount(row.totalTipCents, "小费工资")}
        <b aria-hidden="true">＝</b>
        {amount(row.employeeIncomeCents, "阶段总收入", true)}
      </div>
    </article>
  );
}

export function EmployeeSubtotalSection({
  storeId,
  summary,
  ownerPhone,
  canSend,
  busy,
  run,
  onViewDetails,
}: {
  storeId: string;
  summary: FinanceSummaryResponse;
  ownerPhone: string;
  canSend: boolean;
  busy: boolean;
  run: (action: () => Promise<void>) => Promise<void>;
  onViewDetails: (membershipId: string, label: string) => void;
}) {
  const [recipientPhone, setRecipientPhone] = useState(ownerPhone);
  const [deliveries, setDeliveries] = useState<EmployeeSettlementDeliveryList | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sendMessage, setSendMessage] = useState("");
  const [sending, setSending] = useState(false);
  const loadDeliveries = useCallback(async () => setDeliveries(await apiRequest<EmployeeSettlementDeliveryList>(`/stores/${storeId}/employee-settlements/summary-deliveries`)), [storeId]);

  useEffect(() => { setRecipientPhone((current) => current || ownerPhone); }, [ownerPhone]);
  useEffect(() => { if (canSend) void loadDeliveries().catch(() => undefined); }, [canSend, loadDeliveries]);
  useEffect(() => {
    if (!deliveries?.deliveries.some((item) => item.status === "QUEUED" || item.status === "CLAIMED")) return;
    const timer = window.setInterval(() => void loadDeliveries().catch(() => undefined), 10_000);
    return () => window.clearInterval(timer);
  }, [deliveries, loadDeliveries]);
  useEffect(() => {
    if (!historyOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setHistoryOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [historyOpen]);

  async function send() {
    setSending(true);
    setSendMessage("正在加入短信发送队列…");
    try {
      await apiRequest(`/stores/${storeId}/employee-settlements/summary-deliveries`, {
        method: "POST",
        idempotent: true,
        body: { ...summary.filters, recipientPhoneE164: recipientPhone.trim() },
      });
      await loadDeliveries();
      setSendMessage("员工小计已加入发送队列，可在发送记录中查看进度。");
    } catch (error) {
      setSendMessage(`发送失败：${errorMessage(error)}`);
      throw error;
    } finally {
      setSending(false);
    }
  }

  const deliveryAction = (delivery: EmployeeSettlementDelivery, kind: "cancel" | "retry" | "retry-detail") => void run(async () => {
    if (kind === "cancel") {
      if (!window.confirm("确认取消这条员工小计短信任务？")) return;
      await apiRequest(`/stores/${storeId}/employee-settlements/deliveries/${delivery.id}`, { method: "DELETE" });
    } else {
      const endpoint = kind === "retry-detail" ? "retry-detail" : "retry";
      await apiRequest(`/stores/${storeId}/employee-settlements/deliveries/${delivery.id}/${endpoint}`, { method: "POST", idempotent: true });
    }
    await loadDeliveries();
  });

  return (
    <section className="finance-report-section employee-subtotal-section">
      <div className="finance-report-heading employee-subtotal-heading">
        <div>
          <h2>员工小计</h2>
          <p>{summary.filters.dateFrom} 至 {summary.filters.dateTo} · {paymentLabel(summary.filters.paymentMethod)} · {amountLabel(summary.filters.amountType)}。金额保留到美分；综合分成比例自动兼容小数。</p>
        </div>
        {canSend && <div className="employee-subtotal-send-panel">
          <label>接收号码<input type="tel" inputMode="tel" autoComplete="tel" placeholder="例如 +16465551234" value={recipientPhone} onChange={(event) => { setRecipientPhone(event.target.value); setSendMessage(""); }} /></label>
          <button className="primary-action" type="button" disabled={busy || sending || summary.employees.length === 0 || !recipientPhone.trim()} onClick={() => void run(send)}>{sending ? "正在排队…" : "短信发送"}</button>
          <button className="secondary-action settlement-history-button" type="button" onClick={() => setHistoryOpen(true)}>发送记录 <span>{deliveries?.deliveries.length ?? 0}</span></button>
          {sendMessage && <p role="status">{sendMessage}</p>}
        </div>}
      </div>
      {summary.employees.length > 0
        ? <div className="employee-subtotal-grid">{summary.employees.map((row) => <EmployeeSubtotalCard key={row.membershipId} row={row} onViewDetails={(label) => onViewDetails(row.membershipId, label)} />)}</div>
        : <p className="empty-state">当前筛选范围没有员工记工。</p>}
      {historyOpen && <EmployeeSummaryDeliveryHistory value={deliveries} busy={busy} action={deliveryAction} close={() => setHistoryOpen(false)} />}
    </section>
  );
}
