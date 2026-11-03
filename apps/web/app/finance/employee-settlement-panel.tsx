"use client";

import { useAutoDismissState } from "../use-auto-dismiss-state";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiRequest, errorMessage } from "../../lib/api";
import { formatUsdPrecise } from "../../lib/money";
import type { EmployeeSettlementCalendar, EmployeeSettlementShare, EmployeeSettlementPaymentScope, EmployeeSettlementPreview, PayrollSettlement, StoreMember } from "../../lib/types";
import { payrollAmountCents } from "../../lib/payroll-settlement";
import { selectSettlementDate, type SettlementDateRange } from "../../lib/settlement-calendar";
import type { EmployeeSettlementAmountType } from "@massage-note/contracts";
import { SettlementOptions } from "./settlement-options";
import { SettlementCalendar } from "./settlement-calendar";
import { settlementShareMessage } from "../../lib/settlement-share";
import { copyText } from "../../lib/clipboard";
import { SettlementRecords } from "./settlement-records";
import { SettlementSummary } from "./settlement-summary";
import { useLanguage } from "../language-provider";

const money = (value: number) => formatUsdPrecise(value);
const scopeLabel = (scope: EmployeeSettlementPaymentScope) => scope === "CASH" ? "现金" : scope === "NON_CASH" ? "刷卡＋礼物卡" : "全部";
const amountLabel = (amountType?: EmployeeSettlementAmountType) => amountType === "SERVICE" ? "仅大费" : amountType === "TIP" ? "仅小费" : "大费＋小费";

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
  const [paymentScope, setPaymentScope] = useState<EmployeeSettlementPaymentScope>("NON_CASH");
  const [amountType, setAmountType] = useState<EmployeeSettlementAmountType>("ALL");
  const [preview, setPreview] = useState<EmployeeSettlementPreview | null>(null);
  const { t, locale } = useLanguage();
  const [sharing, setSharing] = useState(false);
  const [shareText, setShareText] = useState("");
  const [shareMessage, setShareMessage] = useAutoDismissState("");
  const [shareError, setShareError] = useAutoDismissState("");
  const shareGenerating = useRef(false);
  const shareRequest = useRef(0);

  const registering = useRef(false);
  const payrollRequest = useRef<{ payload: string; key: string } | null>(null);
  const previewRequest = useRef(0);
  const previewRef = useRef(preview);
  previewRef.current = preview;
  const selectionKey = JSON.stringify({ storeId, membershipId, dateFrom, dateTo, paymentScope, amountType });
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
  useEffect(() => () => { previewRequest.current++; shareRequest.current++; }, []);
  useEffect(() => { shareRequest.current++; setShareText(""); setShareMessage(""); setShareError(""); }, [preview]);
  function clearPreview() {
    previewRequest.current++;
    shareRequest.current++;
    setPreview(null);
    setDeduction("0");
    setShareText("");
    setShareMessage("");
    setShareError("");
  }
  const generate = useCallback(async () => {
    if (!membershipId || !dateTo) return;
    const request = ++previewRequest.current;
    const selected = JSON.stringify({ storeId, membershipId, dateFrom, dateTo, paymentScope, amountType });
    const params = new URLSearchParams({ membershipId, dateFrom, dateTo, paymentScope, amountType });
    const result = await apiRequest<EmployeeSettlementPreview>(`/stores/${storeId}/employee-settlements/preview?${params}`);
    if (previewRequest.current === request && selectionRef.current === selected) setPreview(result);
  }, [storeId, membershipId, dateFrom, dateTo, paymentScope, amountType]);
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
    const body = { membershipId: preview.employee.membershipId, dateFrom: preview.dateFrom, dateTo: preview.dateTo, paymentScope: preview.paymentScope, amountType: preview.amountType ?? "ALL", deductionCents, revision: preview.payment.revision };
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
  async function share() {
    if (!preview || shareGenerating.current) return;
    shareGenerating.current = true;
    setSharing(true);
    setShareError("");
    setShareMessage("");
    const request = ++shareRequest.current;
    const selected = selectionKey;
    try {
      {
        const result = await apiRequest<EmployeeSettlementShare>(`/stores/${storeId}/employee-settlements/shares`, {
          method: "POST", idempotent: true,
          body: { membershipId: preview.employee.membershipId, dateFrom: preview.dateFrom, dateTo: preview.dateTo, paymentScope: preview.paymentScope, amountType: preview.amountType ?? "ALL" },
        });
        if (request !== shareRequest.current || selectionRef.current !== selected) return;
        const url = new URL(`${process.env.NEXT_PUBLIC_APP_BASE_PATH ?? ""}/share/settlement?token=${result.token}`, window.location.origin).href;
        const message = settlementShareMessage(result, url, locale);
        setShareText(message);
        await copyText(message);
      }
      if (request === shareRequest.current) setShareMessage("分享链接已复制，任何持有链接的人均可查看，有效期 14 天。");
    } catch (error) {
      if (request === shareRequest.current) setShareError(errorMessage(error));
    } finally {
      shareGenerating.current = false;
      setSharing(false);
    }
  }
  return (
    <section className="employee-settlement-builder">
      <div className="employee-settlement-builder-heading"><div><p className="eyebrow">员工结算区</p><h2>生成区间结算单</h2><p>选择员工和日期范围，结算单始终包含已结与未结记录。</p></div></div>
      <div className={`settlement-selection-layout${preview ? " has-preview" : ""}${payable.length > 6 ? " has-many-employees" : ""}`}>
        <div className="settlement-selection-sidebar">
          <div className="settlement-employee-buttons" role="group" aria-label="选择员工">{payable.map((member) => <button key={member.id} type="button" disabled={busy || sharing} aria-pressed={membershipId === member.id} className={membershipId === member.id ? "is-selected" : ""} onClick={() => { setMembershipId(member.id); clearPreview(); }}>{member.displayName}</button>)}</div>
          <form className="employee-settlement-controls settlement-calendar-controls" onSubmit={(event) => { event.preventDefault(); setDeduction("0"); void run(generate); }}>
            <SettlementOptions paymentScope={paymentScope} amountType={amountType} disabled={busy || sharing || !dateTo} onPaymentScope={value => { setPaymentScope(value); clearPreview(); }} onAmountType={value => { setAmountType(value); clearPreview(); }} />
            <button className="primary-action" type="submit" disabled={busy || sharing || !membershipId || !dateTo}>生成结算单</button>
          </form>
        </div>
        <div className="settlement-calendar-column">
          {payable.length === 0 ? <p className="empty-state">没有可查看的在职成员。</p> : <SettlementCalendar month={month} range={range} data={calendar?.membershipId === membershipId && calendar.month === month ? calendar : null} loading={calendarLoading} error={calendarError} failed={calendarFailed} disabled={busy || sharing} onMonth={setMonth} onDate={(date) => { setRange((current) => selectSettlementDate(current, date)); clearPreview(); }} retry={() => setCalendarEpoch((value) => value + 1)} />}
        </div>
        {preview && <section className="employee-settlement-preview settlement-preview-compact" aria-label="结算单汇总">
          <header>
            <div><p className="eyebrow">{preview.storeName} · 员工区间结算</p><h2>{preview.employee.displayName}</h2><p>{preview.dateFrom} 至 {preview.dateTo} · {scopeLabel(preview.paymentScope)} · {amountLabel(preview.amountType)} · {preview.records.length} 笔</p></div>
          </header>
          <SettlementSummary preview={preview} />
          {!isOwnerPreview && preview.payment && <section className="settlement-payment" aria-label="付款登记">
            <div className="settlement-payment-amounts">
              <article><span>本次未结金额</span><strong>{money(preview.payment.unsettledCents)}</strong></article>
              <label>抵扣金额（美元）<input disabled={busy || sharing || alreadyRegistered || preview.records.length === 0} inputMode="decimal" value={deduction} aria-invalid={invalidDeduction} onChange={(event) => setDeduction(event.target.value)} /></label>
              <article><span>本次实付金额</span><strong>{paidCents === null ? "—" : money(paidCents)}</strong></article>
            </div>
            <details className="settlement-payment-note"><summary>抵扣说明</summary><p>抵扣此前已付金额；此前付款应已登记到账本或现金结算中。本次只登记实付金额，并确认所选日期、来源和工资类型结清。</p></details>
            {invalidDeduction && <p role="alert">抵扣金额需精确到美分，且不能超过本次未结金额。</p>}
          </section>}
          <div className="employee-settlement-preview-actions settlement-preview-footer">
            <div className="employee-settlement-send-actions">
              {!isOwnerPreview && preview.payment && <button className="primary-action" type="button" disabled={busy || sharing || alreadyRegistered || preview.records.length === 0 || invalidDeduction} onClick={settle}>{alreadyRegistered ? "已确认结清" : "已付款"}</button>}
              <button className="secondary-action" type="button" disabled={busy || sharing || preview.records.length === 0} onClick={() => void share()}>{sharing ? "正在生成链接…" : "复制分享链接"}</button>
            </div>
            {shareMessage && <p className="employee-settlement-send-message" role="status">{t(shareMessage)}</p>}
            {shareError && <p className="employee-settlement-send-message" role="alert">{t(shareError)}</p>}
            {shareText && <label className="settlement-share-link">分享内容（链接 14 天有效）<textarea readOnly rows={5} value={shareText} onFocus={event => event.currentTarget.select()} /></label>}
          </div>
        </section>}
      </div>
      {preview && <section className="employee-settlement-preview">
        <SettlementRecords preview={preview} />
      </section>}
    </section>
  );
}
