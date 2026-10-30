import type { GiftCardLedgerResponse, GiftCardSale } from "../../lib/types";
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
  const onlineAccounts = ledger.onlineAccounts ?? [];
  const ledgerRows = [
    ...ledger.sales.filter((sale) => !sale.isOnline).map((sale) => ({ kind: "sale" as const, serialNumber: sale.serialNumber, sale })),
    ...ledger.legacyUsages.map((card) => ({ kind: "legacy" as const, serialNumber: card.serialNumber, card })),
  ].sort((left, right) => left.serialNumber.localeCompare(right.serialNumber, undefined, { numeric: true, sensitivity: "base" }));
  const totalSoldCents = ledger.sales.reduce((sum, sale) => sum + sale.amountCents, 0);
  const totalUsedCents = ledger.sales.reduce(
    (sum, sale) =>
      sum + sale.usageRecords.reduce((usageSum, record) => usageSum + record.amountCents, 0),
    0,
  ) + ledger.legacyUsages.reduce((sum, card) => sum + card.usageRecords.reduce((usageSum, record) => usageSum + record.amountCents, 0), 0)
    + onlineAccounts.reduce((sum, account) => sum + account.usageRecords.reduce((usageSum, record) => usageSum + record.amountCents, 0), 0);

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

  function saleCells(sale: GiftCardSale) {
    return <>
      <td className="gift-card-ledger__sale-date">{dateOnly(sale.businessDate)}</td>
      <td>{money(sale.faceValueCents)}</td>
      <td>{sale.discountCents > 0 ? `${(sale.discountRateBps / 100).toFixed(2)}% · -${money(sale.discountCents)}` : "—"}</td>
      <td>{money(sale.amountCents)}</td>
      <td>{sale.operator.displayName}</td>
      <td>{paymentMethod(sale.cashCents, sale.cardCents)}</td>
    </>;
  }

  return (
    <section className="finance-section gift-card-ledger">
      <div className="gift-card-ledger__summary">
        <article><span>已售礼物卡</span><strong>{ledger.sales.length} 张</strong></article>
        <article><span>售出总额</span><strong>{money(totalSoldCents)}</strong></article>
        <article><span>已登记使用</span><strong>{money(totalUsedCents)}</strong></article>
        <article className="balance-card"><span>下一张序列号</span><strong>{ledger.nextSerialNumber || "自动号码已用完"}</strong></article>
      </div>
      <div>
        <p className="eyebrow">礼物卡台账</p>
        <h2 className="table-title">按序列号或用户名自动排序</h2>
        <p className="field-help">使用记录来自普通记账中的礼物卡付款；实体卡与网上卖卡在同一台账分区展示，网上卖卡按用户名归组。</p>
      </div>
      {ledgerRows.length > 0 || onlineAccounts.length > 0 ? (
        <ResponsiveDataView desktop={<div className="table-scroll">
          <table className="data-table gift-card-ledger__table" aria-label="礼物卡台账">
            <thead>
              <tr><th>序列号 / 用户名</th><th>售出日</th><th>礼物卡面值</th><th>折扣</th><th>实际收款</th><th>售出人</th><th>付款方式</th><th>使用记录</th></tr>
            </thead>
            {ledgerRows.length > 0 && <tbody aria-label="实体卡">
              <tr><th className="gift-card-ledger__section-heading" colSpan={8} scope="rowgroup">实体卡 · 按序列号记录</th></tr>
              {ledgerRows.map((row) => row.kind === "sale" ? (
                  <tr key={row.sale.id}>
                    <td><strong className="gift-card-ledger__serial">{row.sale.serialNumber}</strong></td>
                    {saleCells(row.sale)}
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
            </tbody>}
            {onlineAccounts.length > 0 && <tbody aria-label="网上卖卡">
              <tr><th className="gift-card-ledger__section-heading" colSpan={8} scope="rowgroup">网上卖卡 · 按用户名记录</th></tr>
              {onlineAccounts.map((account) => {
                const identity = <td className="gift-card-ledger__account" rowSpan={Math.max(1, account.sales.length)}>
                  <strong className="gift-card-ledger__serial">用户名 {account.username}</strong>
                  {account.sales.length > 0 && <small>{account.sales.length} 次购买 · 实收 {money(account.sales.reduce((sum, sale) => sum + sale.amountCents, 0))}</small>}
                </td>;
                const usages = <td className="gift-card-ledger__usage-cell" rowSpan={Math.max(1, account.sales.length)}>
                  {account.usageRecords.length ? usageDetails(account.usageRecords) : <span className="gift-card-ledger__unused">暂无使用记录</span>}
                </td>;
                return account.sales.length > 0 ? account.sales.map((sale, index) => <tr key={sale.id}>
                  {index === 0 && identity}
                  {saleCells(sale)}
                  {index === 0 && usages}
                </tr>) : <tr key={`online-${account.username}`}>
                  {identity}
                  <td colSpan={6}><span className="gift-card-ledger__unused">未登记销售</span></td>
                  {usages}
                </tr>;
              })}
            </tbody>}
          </table>
        </div>}>
          {ledgerRows.length > 0 && <section className="gift-card-ledger__mobile-section" aria-label="实体卡">
            <h3 className="table-title">实体卡 · 按序列号记录</h3>
            <ul className="mobile-data-list">{ledgerRows.map(row => <li key={row.kind === "sale" ? row.sale.id : `legacy-${row.card.serialNumber}`}><MobileDataCard title={`礼物卡 ${row.serialNumber}`} subtitle={row.kind === "sale" ? `售出日 ${dateOnly(row.sale.businessDate)}` : "未登记销售 · 老卡使用记录"}>
              {row.kind === "sale" && <RecordFacts items={[{ label: "礼物卡面值", value: money(row.sale.faceValueCents) }, { label: "实际收款", value: money(row.sale.amountCents) }, { label: "折扣", value: row.sale.discountCents > 0 ? `${(row.sale.discountRateBps / 100).toFixed(2)}% · -${money(row.sale.discountCents)}` : "—" }, { label: "售出人", value: row.sale.operator.displayName }, { label: "付款方式", value: paymentMethod(row.sale.cashCents, row.sale.cardCents), wide: true }]} />}
              <div className="mobile-card-usages"><h4>使用记录</h4>{(row.kind === "sale" ? row.sale.usageRecords : row.card.usageRecords).length ? usageDetails(row.kind === "sale" ? row.sale.usageRecords : row.card.usageRecords) : <p className="field-help">暂无使用记录</p>}</div>
            </MobileDataCard></li>)}</ul>
          </section>}
          {onlineAccounts.length > 0 && <section className="gift-card-ledger__mobile-section" aria-label="网上卖卡">
            <h3 className="table-title">网上卖卡 · 按用户名记录</h3>
            <ul className="mobile-data-list">{onlineAccounts.map((account) => <li key={account.username}>
              <MobileDataCard title={`用户名 ${account.username}`} subtitle={account.sales.length ? `${account.sales.length} 次购买` : "未登记销售"}>
                <RecordFacts items={[{ label: "售出总额", value: account.sales.length ? money(account.sales.reduce((sum, sale) => sum + sale.amountCents, 0)) : "—" }]} />
                {account.sales.length > 0 && <details className="mobile-data-card__details"><summary>购买记录</summary>
                  <div className="gift-card-ledger__usage-list">{account.sales.map((sale) => <article key={sale.id}>
                    <div><strong>{dateOnly(sale.businessDate)} · {sale.operator.displayName}</strong><span>面值 {money(sale.faceValueCents)}</span></div>
                    <div><span>{paymentMethod(sale.cashCents, sale.cardCents)}</span><strong>实际收款 {money(sale.amountCents)}</strong></div>
                  </article>)}</div>
                </details>}
                <div className="mobile-card-usages"><h4>使用记录</h4>{account.usageRecords.length ? usageDetails(account.usageRecords) : <p className="field-help">暂无使用记录</p>}</div>
              </MobileDataCard>
            </li>)}</ul>
          </section>}
        </ResponsiveDataView>
      ) : (
        <p className="empty-state">还没有售出或使用过的礼物卡。第一张销售卡会从序列号 1001 开始。</p>
      )}
    </section>
  );
}
