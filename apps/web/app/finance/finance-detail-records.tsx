import { formatUsd } from "../../lib/money";
import type { FinanceDetailsResponse } from "../../lib/types";
import { MobileDataCard, RecordFacts } from "../ui/responsive-data-view";
import { dateOnly } from "./date-utils";

const money = (value: number | null | undefined) => value == null ? "—" : formatUsd(value);

export function FinanceRecordCards({ details }: { details: FinanceDetailsResponse }) {
  const scope = details.filters.paymentMethod === "CASH" ? "现金" : details.filters.paymentMethod === "NON_CASH" ? "刷卡＋礼物卡" : "全部付款";
  return <ul className="mobile-data-list">{details.records.map(record => <li key={record.id}><MobileDataCard title={record.employee.displayName} subtitle={`${dateOnly(record.businessDate)} · ${record.serviceSnapshot?.shortName ?? "自定义"}`} className={record.isHighlighted ? "mobile-data-card--highlighted" : ""} status={<span>{record.isHighlighted && <>高亮 · </>}{record.status === "CONFIRMED" ? "已确认" : "待结账"}</span>}>
    {record.hasCashAndNonCashPayment && details.filters.paymentMethod !== "ALL" && <p className="mobile-data-card__note">混合付款 · 仅计{scope}</p>}
    <RecordFacts items={[{ label: "客人总付款", value: money(record.customerTotalPaidCents) }, { label: "所选员工收入", value: money(record.selectedEmployeeIncomeCents) }]} />
    <details className="mobile-data-card__details"><summary>金额组成明细</summary><RecordFacts items={[
      { label: "主要项目", value: money(record.mainServiceAmountCents) }, { label: "加项", value: money(record.addonTotalCents) }, { label: "大费基数", value: money(record.grossFeeBaseCents) }, { label: "折扣", value: money(record.discountTotalCents) }, { label: "折后大费", value: money(record.discountedFeePerformanceCents) },
      { label: "现金大费", value: money(record.cashServiceCents) }, { label: "刷卡大费", value: money(record.cardServiceCents) }, { label: "礼物卡大费", value: money(record.giftCardServiceCents) }, { label: "礼物卡序列号", value: record.giftCardSerialNumber ?? "—" },
      { label: "现金小费", value: money(record.cashTipCents) }, { label: "刷卡小费", value: money(record.cardTipCents) }, { label: "礼物卡小费", value: money(record.giftCardTipCents) }, { label: "所选大费工资", value: money(record.selectedLargeFeeWageCents) }, { label: "所选小费", value: money(record.selectedTipCents) },
    ]} /></details>
  </MobileDataCard></li>)}</ul>;
}

export function FinanceGiftSaleCards({ sales }: { sales: FinanceDetailsResponse["giftCardSales"] }) {
  return <ul className="mobile-data-list">{sales.map(sale => <li key={sale.id}><MobileDataCard title={`礼物卡 ${sale.serialNumber}`} subtitle={dateOnly(sale.businessDate)}>
    <RecordFacts items={[{ label: "面值", value: money(sale.faceValueCents) }, { label: "实际收款", value: money(sale.amountCents) }, { label: "折扣", value: money(sale.discountCents) }, { label: "现金收款", value: money(sale.cashCents) }, { label: "刷卡收款", value: money(sale.cardCents) }, { label: "操作人", value: sale.operator.displayName }]} />
  </MobileDataCard></li>)}</ul>;
}
