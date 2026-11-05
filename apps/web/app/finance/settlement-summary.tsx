import { formatUsdPrecise } from "../../lib/money";
import type { EmployeeSettlementStatement } from "../../lib/types";
import { RecordFacts, ResponsiveDataView } from "../ui/responsive-data-view";

export function SettlementSummary({ preview, layout }: { preview: EmployeeSettlementStatement; layout?: "ledger" }) {
  const summary = preview.summary;
  const money = formatUsdPrecise;
  if (layout === "ledger") {
    const sources = [
      { scope: "CASH", label: "现金", wage: summary.cashLargeFeeWageCents, tip: summary.cashTipCents },
      { scope: "NON_CASH", label: "刷卡＋礼物卡", wage: summary.nonCashLargeFeeWageCents, tip: summary.nonCashTipCents },
    ].filter(source => preview.paymentScope === "ALL" || source.scope === preview.paymentScope);
    return <section className="settlement-ledger-summary" aria-label="工资构成">
      <div className="settlement-ledger-total"><span>区间工资合计</span><strong>{money(summary.totalIncomeCents)}</strong><p>包含所选范围内已结与未结工资。</p></div>
      <div className="settlement-source-table"><table>
        <thead><tr><th scope="col">工资来源</th><th scope="col">大费工资</th><th scope="col">小费工资</th></tr></thead>
        <tbody>{sources.map(source => <tr key={source.scope}><th scope="row">{source.label}</th><td>{money(source.wage)}</td><td>{money(source.tip)}</td></tr>)}</tbody>
      </table></div>
    </section>;
  }
  if (preview.paymentScope === "CASH") return <div className="employee-settlement-summary mode-single"><article><span>现金大费工资</span><strong>{money(summary.cashLargeFeeWageCents)}</strong></article><article><span>现金小费</span><strong>{money(summary.cashTipCents)}</strong></article><article className="total"><span>现金工资合计</span><strong>{money(summary.cashIncomeCents)}</strong></article></div>;
  if (preview.paymentScope === "NON_CASH") return <div className="employee-settlement-summary mode-single"><article><span>刷卡＋礼卡大费工资</span><strong>{money(summary.nonCashLargeFeeWageCents)}</strong></article><article><span>刷卡＋礼卡小费</span><strong>{money(summary.nonCashTipCents)}</strong></article><article className="total"><span>非现金工资合计</span><strong>{money(summary.nonCashIncomeCents)}</strong></article></div>;
  return <div className="employee-settlement-summary mode-all">
    <ResponsiveDataView desktop={<div className="employee-settlement-matrix"><span /><b>现金</b><b>刷卡＋礼卡</b><b>合计</b><strong>大费工资</strong><span>{money(summary.cashLargeFeeWageCents)}</span><span>{money(summary.nonCashLargeFeeWageCents)}</span><span>{money(summary.cashLargeFeeWageCents + summary.nonCashLargeFeeWageCents)}</span><strong>小费工资</strong><span>{money(summary.cashTipCents)}</span><span>{money(summary.nonCashTipCents)}</span><span>{money(summary.cashTipCents + summary.nonCashTipCents)}</span></div>}>
      <div className="settlement-summary-breakdown">
        <section><h3>大费工资</h3><RecordFacts items={[{ label: "现金", value: money(summary.cashLargeFeeWageCents) }, { label: "刷卡＋礼卡", value: money(summary.nonCashLargeFeeWageCents) }, { label: "合计", value: money(summary.cashLargeFeeWageCents + summary.nonCashLargeFeeWageCents), wide: true }]} /></section>
        <section><h3>小费工资</h3><RecordFacts items={[{ label: "现金", value: money(summary.cashTipCents) }, { label: "刷卡＋礼卡", value: money(summary.nonCashTipCents) }, { label: "合计", value: money(summary.cashTipCents + summary.nonCashTipCents), wide: true }]} /></section>
      </div>
    </ResponsiveDataView>
    <article className="total"><span>区间总收入</span><strong>{money(summary.totalIncomeCents)}</strong></article>
  </div>;
}
