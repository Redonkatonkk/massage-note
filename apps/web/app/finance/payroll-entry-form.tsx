"use client";

import { useRef, useState } from "react";
import { payrollSettlementEntrySchema, type EmployeeSettlementPaymentScope } from "@massage-note/contracts";
import { apiRequest } from "../../lib/api";
import { formatMoneyInput } from "../../lib/money";
import { payrollAmountCents } from "../../lib/payroll-settlement";
import type { PayrollSettlement, StoreMember } from "../../lib/types";
import { dateOnly } from "./date-utils";

export function PayrollEntryForm({ storeId, businessDate, members, settlement, busy, run, onSaved, close }: {
  storeId: string; businessDate: string; members: StoreMember[]; settlement?: PayrollSettlement;
  busy: boolean; run: (action: () => Promise<void>) => Promise<void>; onSaved: () => Promise<void>; close?: () => void;
}) {
  const payable = members.filter((member) => member.role !== "OWNER" && (!member.deletedAt || member.id === settlement?.membershipId));
  const [membershipId, setMembershipId] = useState(settlement?.membershipId ?? payable[0]?.id ?? "");
  const [periodStart, setPeriodStart] = useState(settlement ? dateOnly(settlement.periodStart) : `${businessDate.slice(0, 8)}01`);
  const [periodEnd, setPeriodEnd] = useState(settlement ? dateOnly(settlement.periodEnd) : businessDate);
  const [amount, setAmount] = useState(settlement ? formatMoneyInput(settlement.totalPaidCents) : "");
  const [paymentScope, setPaymentScope] = useState<EmployeeSettlementPaymentScope | "">(settlement ? settlement.paymentScope ?? "" : "ALL");
  const request = useRef<{ payload: string; key: string } | null>(null);
  const submitting = useRef(false);

  function submit() {
    if (busy || submitting.current) return;
    submitting.current = true;
    void run(async () => {
      try {
        const entry = payrollSettlementEntrySchema.parse({ membershipId, periodStart, periodEnd, totalPaidCents: payrollAmountCents(amount), paymentScope });
        const body = settlement ? { ...entry, version: settlement.version } : entry;
        const payload = JSON.stringify(body);
        if (request.current?.payload !== payload) request.current = { payload, key: crypto.randomUUID() };
        await apiRequest(`/stores/${storeId}/payroll-settlements${settlement ? `/${settlement.id}` : ""}`, {
          method: settlement ? "PATCH" : "POST", body, headers: { "Idempotency-Key": request.current.key },
        });
        request.current = null;
        if (!settlement) setAmount("");
        close?.();
        await onSaved();
      } finally {
        submitting.current = false;
      }
    });
  }

  return <form className={`payroll-form${settlement ? " payroll-edit-modal" : ""}`} role={settlement ? "dialog" : undefined} aria-modal={settlement ? true : undefined} aria-labelledby={settlement ? "payroll-edit-title" : undefined} onSubmit={(event) => { event.preventDefault(); submit(); }}>
    {settlement ? <div className="modal-heading"><h2 id="payroll-edit-title">修改工资结算</h2><button className="close-button" type="button" disabled={busy} onClick={close}>关闭</button></div> : <h2>登记已付工资</h2>}
    <div className="payroll-fields">
      <label>员工<select required disabled={busy} value={membershipId} onChange={(event) => setMembershipId(event.target.value)}>{payable.map((member) => <option key={member.id} value={member.id}>{member.displayName}</option>)}</select></label>
      <label>开始日期<input required disabled={busy} type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} /></label>
      <label>结束日期<input required disabled={busy} type="date" min={periodStart} value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} /></label>
      <label>金额（美元）<input required disabled={busy} inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></label>
      <label>工资来源<select required disabled={busy} value={paymentScope} onChange={(event) => setPaymentScope(event.target.value as EmployeeSettlementPaymentScope)}>
        {paymentScope === "" && <option value="">请选择工资来源</option>}
        <option value="CASH">现金</option><option value="NON_CASH">刷卡＋礼物卡</option><option value="ALL">全部</option>
      </select></label>
    </div>
    <button className="primary-action" type="submit" disabled={busy || !membershipId || !paymentScope}>{settlement ? "保存修改" : "保存工资结算"}</button>
  </form>;
}
