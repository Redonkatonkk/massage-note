import type { GiftCardLedgerResponse } from "../../lib/types";
import { formatUsd } from "../../lib/money";
import { dateOnly } from "./date-utils";
import { MobileDataCard, RecordFacts, ResponsiveDataView } from "../ui/responsive-data-view";

function money(cents: number): string {
  return formatUsd(cents);
}

function paymentMethod(cashCents: number, cardCents: number): string {
  const methods = [
    cashCents > 0 ? `现金 ${money(cashCents)}` : null,
    cardCents > 0 ? `刷卡 ${money(cardCents)}` : null,
  ].filter((value): value is string => Boolean(value));
  return methods.join("＋") || "—";
}

export function GiftCardLedger({ ledger }: { ledger: GiftCardLedgerResponse }) {
  const ledgerRows = [
    ...ledger.sales.map((sale) => ({ kind: "sale" as const, serialNumber: sale.serialNumber, sale })),
    ...ledger.legacyUsages.map((card) => ({ kind: "legacy" as const, serialNumber: card.serialNumber, card })),
  ].sort((left, right) => left.serialNumber.localeCompare(right.serialNumber, undefined, { numeric: true, sensitivity: "base" }));
  const totalSoldCents = ledger.sales.reduce((sum, sale) => sum + sale.amountCents, 0);
  const totalUsedCents = ledger.sales.reduce(
    (sum, sale) =>
      sum + sale.usageRecords.reduce((usageSum, record) => usageSum + record.amountCents, 0),
    0,
  ) + ledger.legacyUsages.reduce((sum, card) => sum + card.usageRecords.reduce((usageSum, record) => usageSum + record.amountCents, 0), 0);

  function usageDetails(records: GiftCardLedgerResponse["legacyUsages"][number]["usageRecords"]) {
    const usedCents = records.reduce((sum, record) => sum + record.amountCents, 0);
    const content = <div className="gift-card-ledger__usage-list">{records.map((record) => (
      <article key={record.id}>
        <div><strong>{dateOnly(record.businessDate)} · {record.employee.displayName}</strong><span>{record.serviceShortName ?? "自定义项目"}</span></div>
        <div><span>大费 {money(record.serviceCents)}</span><span>小费 {money(record.tipCents)}</span><strong>合计 {money(record.amountCents)}</strong></div>
      </article>
    ))}</div>;
    return records.length === 1 ? content : <details><summary>{records.length} 条 · 共 {money(usedCents)}</summary>{content}</details>;
  }

  return (
    <section className="finance-section gift-card-ledger">
      <div className="gift-card-ledger__summary">
        <article><span>已售礼物卡</span><strong>{ledger.sales.length} 张</strong></article>
        <article><span>售出总额</span><strong>{money(totalSoldCents)}</strong></article>
        <article><span>已登记使用</span><strong>{money(totalUsedCents)}</strong></article>
        <article className="balance-card"><span>下一张序列号</span><strong>{ledger.nextSerialNumber}</strong></article>
      </div>
      <div>
        <p className="eyebrow">礼物卡台账</p>
        <h2 className="table-title">按序列号自动排序</h2>
        <p className="field-help">使用记录来自普通记账中的礼物卡付款，可在同一张卡下保留多条记录。</p>
      </div>
      {ledger.sales.length > 0 || ledger.legacyUsages.length > 0 ? (
        <ResponsiveDataView desktop={<div className="table-scroll">
          <table className="data-table gift-card-ledger__table">
            <thead>
              <tr><th>序列号</th><th>售出日</th><th>礼物卡面值</th><th>折扣</th><th>实际收款</th><th>售出人</th><th>付款方式</th><th>使用记录</th></tr>
            </thead>
            <tbody>
              {ledgerRows.map((row) => row.kind === "sale" ? (
                  <tr key={row.sale.id}>
                    <td><strong className="gift-card-ledger__serial">{row.sale.serialNumber}</strong></td>
                    <td>{dateOnly(row.sale.businessDate)}</td>
                    <td>{money(row.sale.faceValueCents)}</td>
                    <td>{row.sale.discountCents > 0 ? `${(row.sale.discountRateBps / 100).toFixed(2)}% · -${money(row.sale.discountCents)}` : "—"}</td>
                    <td>{money(row.sale.amountCents)}</td>
                    <td>{row.sale.operator.displayName}</td>
                    <td>{paymentMethod(row.sale.cashCents, row.sale.cardCents)}</td>
                    <td className="gift-card-ledger__usage-cell">
                      {row.sale.usageRecords.length === 0 ? <span className="gift-card-ledger__unused">暂无使用记录</span> : usageDetails(row.sale.usageRecords)}
                    </td>
                  </tr>
                ) : (
                  <tr key={`legacy-${row.card.serialNumber}`} className="gift-card-ledger__legacy-row">
                    <td><strong className="gift-card-ledger__serial">{row.card.serialNumber}</strong><small>未登记销售</small></td>
                    <td colSpan={6}><span className="gift-card-ledger__unused">老卡使用记录</span></td>
                    <td className="gift-card-ledger__usage-cell">{usageDetails(row.card.usageRecords)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>}>
          <ul className="mobile-data-list">{ledgerRows.map(row => <li key={row.kind === "sale" ? row.sale.id : `legacy-${row.card.serialNumber}`}><MobileDataCard title={`礼物卡 ${row.serialNumber}`} subtitle={row.kind === "sale" ? `售出日 ${dateOnly(row.sale.businessDate)}` : "未登记销售 · 老卡使用记录"}>
            {row.kind === "sale" && <RecordFacts items={[{ label: "礼物卡面值", value: money(row.sale.faceValueCents) }, { label: "实际收款", value: money(row.sale.amountCents) }, { label: "折扣", value: row.sale.discountCents > 0 ? `${(row.sale.discountRateBps / 100).toFixed(2)}% · -${money(row.sale.discountCents)}` : "—" }, { label: "售出人", value: row.sale.operator.displayName }, { label: "付款方式", value: paymentMethod(row.sale.cashCents, row.sale.cardCents), wide: true }]} />}
            <div className="mobile-card-usages"><h4>使用记录</h4>{(row.kind === "sale" ? row.sale.usageRecords : row.card.usageRecords).length ? usageDetails(row.kind === "sale" ? row.sale.usageRecords : row.card.usageRecords) : <p className="field-help">暂无使用记录</p>}</div>
          </MobileDataCard></li>)}</ul>
        </ResponsiveDataView>
      ) : (
        <p className="empty-state">还没有售出或使用过的礼物卡。第一张销售卡会从序列号 1001 开始。</p>
      )}
    </section>
  );
}
