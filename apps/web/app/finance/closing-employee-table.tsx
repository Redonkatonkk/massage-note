"use client";

import { formatUsd } from "../../lib/money";
import type { CashSettlementRow, ClosingEmployeeTotals } from "../../lib/types";
import { useLanguage } from "../language-provider";
import { MobileDataCard, RecordFacts, ResponsiveDataView } from "../ui/responsive-data-view";

export function CashSettlementDetails({ row }: { row: CashSettlementRow }) {
  const { locale } = useLanguage();
  return <details className="closing-cash-details">
    <summary>现金明细</summary>
    <dl>
      <div><dt>现金大费</dt><dd>{formatUsd(row.cashServiceCents, locale)}</dd></div>
      <div><dt>现金小费</dt><dd>{formatUsd(row.cashTipCents, locale)}</dd></div>
      <div><dt>共收到现金</dt><dd>{formatUsd(row.cashReceivedCents, locale)}</dd></div>
      <div><dt>现金对应工资</dt><dd>{formatUsd(row.cashAllocatedServiceWageCents, locale)}</dd></div>
      <div><dt>实际取得工资</dt><dd>{formatUsd(row.cashAcquiredServiceWageCents, locale)}</dd></div>
      <div><dt>工资缺口</dt><dd>{formatUsd(row.cashWageShortfallCents, locale)}</dd></div>
      <div><dt>员工应保留</dt><dd>{formatUsd(row.cashRetainedCents, locale)}</dd></div>
      {row.dailySettlementEnabled && <div><dt>{locale === "en-US" ? "Daily wages to pay (excluding cash tips)" : "每日结清应发工资（不含现金小费）"}</dt><dd>{formatUsd(row.dailySettlementPayoutCents ?? 0, locale)}</dd></div>}
      <div><dt>应提交店铺</dt><dd>{formatUsd(row.cashToSubmitToStoreCents, locale)}</dd></div>
    </dl>
    <p className="cash-settlement-meta">
      <span>备注：{row.note || "未填写"}</span>
      <span>结算人：{row.settledByDisplayName || "尚未结算"}</span>
      <span>结算时间：{row.settledAt ? new Date(row.settledAt).toLocaleString(locale) : "尚未结算"}</span>
    </p>
  </details>;
}

export function ClosingEmployeeTable({ employees, cashRows, busy, cashLoadFailed, onReloadCash, onSettleAll, onToggleCash }: {
  employees: ClosingEmployeeTotals[];
  cashRows: CashSettlementRow[] | null;
  busy: boolean;
  cashLoadFailed: boolean;
  onReloadCash: () => void;
  onSettleAll: () => void;
  onToggleCash: (row: CashSettlementRow) => void;
}) {
  const { locale } = useLanguage();
  const cashByMember = new Map(cashRows?.map(row => [row.membershipId, row]));
  const cashStatus = (cash: CashSettlementRow) => cash.status === "SETTLED" ? (cash.dailySettlementEnabled ? "当天工资已全部结清" : "已全部结清") : "未结清";
  const cashAction = (cash: CashSettlementRow | undefined) => <button className="table-action" type="button" disabled={busy || !cash} onClick={() => { if (cash) onToggleCash(cash); }}>{cash?.status === "SETTLED" ? "取消结清" : "标记全部结清"}</button>;
  return <>
    <div className="closing-employee-heading">
      <h2 className="table-title">每位员工日结检查</h2>
      <button className="primary-action" type="button" disabled={busy || !cashRows?.length || cashRows.every(row => row.status === "SETTLED")} onClick={onSettleAll}>一键全部结清</button>
    </div>
    <p className="field-help">现金未结清不影响正常日结，日结后仍可结清现金。</p>
    {!cashRows && <p className="field-help">{cashLoadFailed ? "现金结算暂不可用" : "正在加载现金结算…"}{cashLoadFailed && <button className="secondary-action compact" type="button" disabled={busy} onClick={onReloadCash}>重新加载现金</button>}</p>}
    <ResponsiveDataView desktop={<div className="table-scroll"><table className="data-table closing-employee-table">
      <thead><tr><th>员工</th><th>单数</th><th>大费基数</th><th>折扣</th><th>折后大费</th><th>小费</th><th>应得工资</th><th>待结账</th><th>应提交店铺</th><th>员工应保留</th><th>现金结清状态</th><th>操作</th></tr></thead>
      <tbody>{employees.map(employee => {
        const cash = cashByMember.get(employee.membershipId);
        return <tr key={employee.membershipId}>
          <td>{employee.displayName}</td><td>{employee.recordCount}</td>
          <td>{formatUsd(employee.grossFeeBaseCents, locale)}</td><td>{formatUsd(employee.discountTotalCents, locale)}</td>
          <td>{formatUsd(employee.discountedFeePerformanceCents, locale)}</td><td>{formatUsd(employee.totalTipCents, locale)}</td>
          <td>{formatUsd(employee.employeeIncomeCents, locale)}</td><td>{employee.incompleteRecordCount}</td>
          <td>{cash ? formatUsd(cash.cashToSubmitToStoreCents, locale) : "—"}</td>
          <td>{cash ? formatUsd(cash.cashRetainedCents, locale) : "—"}</td>
          <td>{cash ? <><span>{cashStatus(cash)}</span><CashSettlementDetails row={cash} /></> : "—"}</td>
          <td>{cashAction(cash)}</td>
        </tr>;
      })}</tbody>
    </table></div>}>
      <ul className="mobile-data-list">{employees.map(employee => {
        const cash = cashByMember.get(employee.membershipId);
        return <li key={employee.membershipId}><MobileDataCard title={employee.displayName} subtitle={`${employee.recordCount} 单`} status={cash ? <span className={`status-chip${cash.status === "SETTLED" ? "" : " warning"}`}>{cashStatus(cash)}</span> : "现金结算暂不可用"} actions={cashAction(cash)}>
          <RecordFacts items={[{ label: "应得工资", value: formatUsd(employee.employeeIncomeCents, locale) }, { label: "待结账", value: employee.incompleteRecordCount }, { label: "应提交店铺", value: cash ? formatUsd(cash.cashToSubmitToStoreCents, locale) : "—" }, { label: "员工应保留", value: cash ? formatUsd(cash.cashRetainedCents, locale) : "—" }]} />
          <details className="mobile-data-card__details"><summary>工资与记工明细</summary><RecordFacts items={[{ label: "大费基数", value: formatUsd(employee.grossFeeBaseCents, locale) }, { label: "折扣", value: formatUsd(employee.discountTotalCents, locale) }, { label: "折后大费", value: formatUsd(employee.discountedFeePerformanceCents, locale) }, { label: "小费", value: formatUsd(employee.totalTipCents, locale) }]} />{cash && <CashSettlementDetails row={cash} />}</details>
        </MobileDataCard></li>;
      })}</ul>
    </ResponsiveDataView>
    {employees.length === 0 && <p className="empty-state">当日没有记工，无需现金结算。</p>}
  </>;
}
