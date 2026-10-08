"use client";

import { FinanceGiftSaleCards, FinanceRecordCards } from "./finance-detail-records";
import { ResponsiveDataView } from "../ui/responsive-data-view";
import { formatUsd } from "../../lib/money";
import type { FinanceDetailsResponse } from "../../lib/types";
import { dateOnly } from "./date-utils";

function money(cents: number | null | undefined): string {
  return cents == null ? "—" : formatUsd(cents);
}

export function FinanceDetailsDialog({
  details,
  title,
  onClose,
}: {
  details: FinanceDetailsResponse;
  title: string;
  onClose: () => void;
}) {
  const selectedScope = details.filters.paymentMethod === "CASH" ? "现金" : details.filters.paymentMethod === "NON_CASH" ? "刷卡＋礼物卡" : "全部付款";
  return (
    <div className="finance-details-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="finance-details" role="dialog" aria-modal="true" aria-labelledby="finance-details-title">
        <div className="finance-details__heading">
          <div>
            <p className="eyebrow">{details.filters.dateFrom} 至 {details.filters.dateTo}</p>
            <h2 id="finance-details-title">{title} · 组成明细</h2>
            <p>{details.records.length} 条记工，{details.giftCardSales.length} 张礼物卡销售；员工收入仅计算“{selectedScope}”对应部分。</p>
          </div>
          <button className="close-button" type="button" onClick={onClose}>关闭</button>
        </div>
        <ResponsiveDataView desktop={<div className="table-scroll finance-details__table"><table className="data-table"><thead><tr><th>营业日</th><th>员工</th><th>项目</th><th>标记</th><th>状态</th><th>主要项目</th><th>加项</th><th>大费基数</th><th>折扣</th><th>折后大费</th><th>现金大费</th><th>刷卡大费</th><th>礼物卡序列号</th><th>礼物卡大费</th><th>现金小费</th><th>刷卡小费</th><th>礼物卡小费</th><th>客人总付款</th><th>所选大费工资</th><th>所选小费</th><th>所选员工收入</th></tr></thead><tbody>{details.records.map((record) => <tr className={record.isHighlighted ? "finance-record--highlighted" : undefined} key={record.id}><td>{dateOnly(record.businessDate)}</td><td>{record.employee.displayName}</td><td>{record.serviceSnapshot?.shortName ?? "自定义"}</td><td><span className="finance-record-labels">{record.isHighlighted && <span className="finance-highlight-label">★ 高亮</span>}{record.hasCashAndNonCashPayment && details.filters.paymentMethod !== "ALL" && <span className="finance-payment-label">混合付款 · 仅计{selectedScope}</span>}{!record.isHighlighted && (!record.hasCashAndNonCashPayment || details.filters.paymentMethod === "ALL") && "—"}</span></td><td>{record.status === "CONFIRMED" ? "已确认" : "待结账"}</td><td>{money(record.mainServiceAmountCents)}</td><td>{money(record.addonTotalCents)}</td><td>{money(record.grossFeeBaseCents)}</td><td>{money(record.discountTotalCents)}</td><td>{money(record.discountedFeePerformanceCents)}</td><td>{money(record.cashServiceCents)}</td><td>{money(record.cardServiceCents)}</td><td>{record.giftCardSerialNumber ?? "—"}</td><td>{money(record.giftCardServiceCents)}</td><td>{money(record.cashTipCents)}</td><td>{money(record.cardTipCents)}</td><td>{money(record.giftCardTipCents)}</td><td>{money(record.customerTotalPaidCents)}</td><td>{money(record.selectedLargeFeeWageCents)}</td><td>{money(record.selectedTipCents)}</td><td><strong>{money(record.selectedEmployeeIncomeCents)}</strong></td></tr>)}</tbody></table></div>}><FinanceRecordCards details={details} /></ResponsiveDataView>
        {details.giftCardSales.length > 0 && <><h3 className="table-title">礼物卡销售明细</h3><ResponsiveDataView desktop={<div className="table-scroll finance-details__table"><table className="data-table"><thead><tr><th>营业日</th><th>序列号</th><th>面值</th><th>折扣</th><th>现金收款</th><th>刷卡收款</th><th>实际收款</th><th>操作人</th></tr></thead><tbody>{details.giftCardSales.map((sale) => <tr key={sale.id}><td>{dateOnly(sale.businessDate)}</td><td>{sale.serialNumber}</td><td>{money(sale.faceValueCents)}</td><td>{money(sale.discountCents)}</td><td>{money(sale.cashCents)}</td><td>{money(sale.cardCents)}</td><td>{money(sale.amountCents)}</td><td>{sale.operator.displayName}</td></tr>)}</tbody></table></div>}><FinanceGiftSaleCards sales={details.giftCardSales} /></ResponsiveDataView></>}
        {details.records.length === 0 && details.giftCardSales.length === 0 && <p className="empty-state">当前范围没有明细记录。</p>}
      </section>
    </div>
  );
}

