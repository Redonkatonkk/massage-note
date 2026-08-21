import type { GiftCardLedgerResponse } from "../../lib/types";
import { formatUsd } from "../../lib/money";

function money(cents: number): string {
  return formatUsd(cents);
}

function dateOnly(value: string): string {
  return value.slice(0, 10);
}

function paymentMethod(cashCents: number, cardCents: number): string {
  const methods = [
    cashCents > 0 ? `现金 ${money(cashCents)}` : null,
    cardCents > 0 ? `刷卡 ${money(cardCents)}` : null,
  ].filter((value): value is string => Boolean(value));
  return methods.join("＋") || "—";
}

export function GiftCardLedger({ ledger }: { ledger: GiftCardLedgerResponse }) {
  const totalSoldCents = ledger.sales.reduce((sum, sale) => sum + sale.amountCents, 0);
  const totalUsedCents = ledger.sales.reduce(
    (sum, sale) =>
      sum + sale.usageRecords.reduce((usageSum, record) => usageSum + record.amountCents, 0),
    0,
  );

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
      {ledger.sales.length > 0 ? (
        <div className="table-scroll">
          <table className="data-table gift-card-ledger__table">
            <thead>
              <tr><th>序列号</th><th>售出日</th><th>礼物卡面值</th><th>折扣</th><th>实际收款</th><th>售出人</th><th>付款方式</th><th>使用记录</th></tr>
            </thead>
            <tbody>
              {ledger.sales.map((sale) => {
                const usedCents = sale.usageRecords.reduce(
                  (sum, record) => sum + record.amountCents,
                  0,
                );
                return (
                  <tr key={sale.id}>
                    <td><strong className="gift-card-ledger__serial">{sale.serialNumber}</strong></td>
                    <td>{dateOnly(sale.businessDate)}</td>
                    <td>{money(sale.faceValueCents)}</td>
                    <td>{sale.discountCents > 0 ? `${(sale.discountRateBps / 100).toFixed(2)}% · -${money(sale.discountCents)}` : "—"}</td>
                    <td>{money(sale.amountCents)}</td>
                    <td>{sale.operator.displayName}</td>
                    <td>{paymentMethod(sale.cashCents, sale.cardCents)}</td>
                    <td className="gift-card-ledger__usage-cell">
                      {sale.usageRecords.length === 0 ? (
                        <span className="gift-card-ledger__unused">暂无使用记录</span>
                      ) : (
                        <details>
                          <summary>{sale.usageRecords.length} 条 · 共 {money(usedCents)}</summary>
                          <div className="gift-card-ledger__usage-list">
                            {sale.usageRecords.map((record) => (
                              <article key={record.id}>
                                <div><strong>{dateOnly(record.businessDate)} · {record.employee.displayName}</strong><span>{record.serviceShortName ?? "自定义项目"}</span></div>
                                <div><span>大费 {money(record.serviceCents)}</span><span>小费 {money(record.tipCents)}</span><strong>合计 {money(record.amountCents)}</strong></div>
                              </article>
                            ))}
                          </div>
                        </details>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="empty-state">还没有售出礼物卡。第一张卡会从序列号 1001 开始。</p>
      )}
    </section>
  );
}
