import { createEmployeeClosingTemplate, type ClosingPaymentPart } from "@massage-note/domain";
import type { DailySnapshot, DailySnapshotMonthToDate } from "@massage-note/contracts";
import type { AppLocale } from "../lib/i18n";
import { formatUsdPrecise } from "../lib/money";

function SnapshotPayments({ parts }: { parts: ClosingPaymentPart[] }) {
  return parts.map(part => {
    const amountOnly = part.method === "cash" || part.method === "card";
    return <span className={`daily-snapshot-payment daily-snapshot-payment--${part.method}`} key={part.method}>
      {amountOnly ? <>
        <span className="daily-snapshot-sr-only">{part.text}</span>
        <span aria-hidden="true">{part.text.slice(part.text.indexOf(" ") + 1)}</span>
      </> : part.text.replace(/^礼卡 /, "礼物卡 ")}
    </span>;
  });
}

/** Read-only presentation; all earnings come from the supplied closing snapshot. */
export function DailySnapshotCard({ snapshot, locale }: { snapshot: DailySnapshot; locale: AppLocale }) {
  const en = locale === "en-US";
  const model = createEmployeeClosingTemplate(snapshot, en ? "en_US" : "zh_CN");
  const pending = model.records.filter(record => record.pending).length;
  const confirmed = model.records.length - pending;
  const date = new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", weekday: "short", timeZone: "UTC" })
    .format(new Date(`${snapshot.businessDate}T12:00:00Z`));

  return <div className="daily-snapshot-content" translate="no">
    <section className="daily-snapshot-strip" aria-label={en ? "Daily earnings and work records" : "当日收入与记工"}>
      <div className="daily-snapshot-summary" data-motion-change>
        <header className="daily-snapshot-summary-heading"><time dateTime={snapshot.businessDate}>{date}</time><span>{model.state}</span></header>
        <div className="daily-snapshot-income"><h2>{en ? "Confirmed earnings" : "已确认收入"}</h2><strong>{model.income}</strong></div>
        <dl className="daily-snapshot-breakdown">
          <div><dt>{model.labels.serviceWages}</dt><dd>{model.serviceWages}</dd></div>
          <div><dt>{model.labels.tips}</dt><dd>{model.tips}</dd></div>
        </dl>
        <p className="daily-snapshot-currency">{en ? "USD · service wages + tips" : "美元 · 大费工资＋小费"}</p>
      </div>

      <section className="daily-snapshot-records" aria-label={en ? "Work records" : "当日记工"}>
        <header className="daily-snapshot-records-heading"><h2>{en ? "Work records" : "当日记工"}</h2><p>{en ? `${confirmed} confirmed` : `${confirmed} 笔已确认`}{pending > 0 && <span className="daily-snapshot-pending-count"> · {en ? `${pending} pending` : `${pending} 笔待结账`}</span>}</p></header>
        {model.records.length > 0 ? <ol className="daily-snapshot-track" tabIndex={0} aria-label={en ? "Work cards in time order; scroll for more" : "按时间排列的记工卡，可左右滑动"}>
          {model.records.map(record => <li key={record.key}>
            <article className={`daily-snapshot-record${record.pending ? " is-pending" : record.highlighted ? " is-highlighted" : ""}`}>
              <header><h3>{record.title}</h3><time>{record.time}</time></header>
              {record.addon && <p className="daily-snapshot-record-note">{record.addon}</p>}
              {record.discount && <p className="daily-snapshot-record-note">{en ? "Discount" : "折扣"} {formatUsdPrecise(record.discountTotalCents, locale)}</p>}
              <dl className="daily-snapshot-record-facts">
                <div><dt>{en ? "Before discount" : "折前大费"}</dt><dd>{record.gross}</dd></div>
                <div><dt>{model.labels.received}</dt><dd><SnapshotPayments parts={record.service} /></dd></div>
                <div><dt>{model.labels.tips}</dt><dd><SnapshotPayments parts={record.tips} /></dd></div>
              </dl>
              <div className="daily-snapshot-record-income"><span>{model.labels.recordIncome}</span><strong>{record.income}</strong></div>
              {record.pending && <p className="daily-snapshot-pending-note">{record.pendingText}</p>}
            </article>
          </li>)}
        </ol> : <p className="daily-snapshot-empty">{en ? "No work records on this date." : "这一天没有记工。"}</p>}
      </section>
    </section>

    <p className="daily-snapshot-footnote">{en ? "Only confirmed records count toward earnings. Check settlement records for wage payments." : "收入仅含已确认记工，工资发放以结算记录为准。"}</p>
  </div>;
}

export function DailySnapshotSources({ snapshot, monthToDate, locale }: { snapshot: DailySnapshot; monthToDate: DailySnapshotMonthToDate; locale: AppLocale }) {
  const en = locale === "en-US";
  const model = createEmployeeClosingTemplate(snapshot, en ? "en_US" : "zh_CN");
  const employee = snapshot.employee;
  // Presentation sums of the saved wage/tip cents; no commission or payment recalculation.
  const totals = [employee.cashLargeFeeDividendCents + employee.cashTipDividendCents, employee.cardLargeFeeDividendCents + employee.cardTipDividendCents];

  return <section className="daily-snapshot-sources" data-motion-change aria-labelledby="daily-snapshot-sources-title" translate="no">
    <h2 id="daily-snapshot-sources-title">{en ? "Earnings by payment source" : "按收款来源核对收入"}</h2>
    <p className="daily-snapshot-month-period">{en ? "Month to date" : "本月至今"}：<time dateTime={monthToDate.dateFrom}>{monthToDate.dateFrom}</time> — <time dateTime={monthToDate.dateTo}>{monthToDate.dateTo}</time></p>
    <div className="daily-snapshot-source-scroll" tabIndex={0} role="region" aria-label={en ? "Daily and month-to-date earnings by source; scroll for more" : "按来源核对今日与本月收入，可左右滑动"}><table>
      <caption>{en ? "Employee earnings, not guest payments" : "以下为员工收入，不是客人付款金额"}</caption>
      <thead><tr><th scope="col">{model.labels.source}</th><th scope="col">{en ? "Today's service wages" : "今日大费工资"}</th><th scope="col">{en ? "Today's tips" : "今日小费"}</th><th scope="col">{en ? "Today's total" : "今日总额"}</th><th scope="col">{en ? "Month-to-date total" : "本月至今合计"}</th></tr></thead>
      <tbody>{model.sources.map((source, index) => <tr key={source.label}><th scope="row">{source.label.replace("礼卡", "礼物卡")}</th><td>{source.wages}</td><td>{source.tips}</td><td>{formatUsdPrecise(totals[index]!, locale)}</td><td>{formatUsdPrecise(index === 0 ? monthToDate.cashIncomeCents : monthToDate.nonCashIncomeCents, locale)}</td></tr>)}</tbody>
      <tfoot><tr><th scope="row">{en ? "Total" : "合计"}</th><td>{model.serviceWages}</td><td>{model.tips}</td><td>{model.income}</td><td>{formatUsdPrecise(monthToDate.totalIncomeCents, locale)}</td></tr></tfoot>
    </table></div>
  </section>;
}
