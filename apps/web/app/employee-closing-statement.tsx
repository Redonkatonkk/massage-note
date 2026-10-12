import { createEmployeeClosingTemplate, type ClosingSnapshot, type ClosingPaymentPart } from "@massage-note/domain";
import type { AppLocale } from "../lib/i18n";

function Payments({ parts }: { parts: ClosingPaymentPart[] }) {
  return <div className="closing-template-payments">{parts.map((part, index) => <span className="closing-template-payment-group" key={part.method}>
    {index > 0 && <span className="closing-template-plus" aria-hidden="true">＋</span>}
    <span className={`closing-template-payment closing-template-payment--${part.method}`}>{part.text}</span>
  </span>)}</div>;
}

export function EmployeeClosingStatement({ snapshot, locale }: { snapshot: ClosingSnapshot; locale: AppLocale }) {
  const model = createEmployeeClosingTemplate(snapshot, locale === "en-US" ? "en_US" : "zh_CN");
  return <article className="closing-template" aria-label={model.title}>
    <header className="closing-template-heading">
      <p className="closing-template-store">{model.store}</p>
      <div className="closing-template-heading-line"><h2>{model.title}</h2><span>{model.state}</span></div>
      <p className="closing-template-date">{model.date}</p>
    </header>
    <section className="closing-template-summary" aria-label={model.labels.income}>
      <div className="closing-template-summary-label"><span>{model.labels.income}</span><small>{model.labels.currency}</small></div>
      <strong className="closing-template-total">{model.income}</strong>
      <p className="closing-template-total-parts">{model.labels.serviceWages} {model.serviceWages} ＋ {model.labels.tips} {model.tips}</p>
      <table className="closing-template-sources"><thead><tr><th scope="col">{model.labels.source}</th><th scope="col">{model.labels.serviceWages}</th><th scope="col">{model.labels.tips}</th></tr></thead><tbody>{model.sources.map(source => <tr key={source.label}><th scope="row">{source.label}</th><td>{source.wages}</td><td>{source.tips}</td></tr>)}</tbody></table>
    </section>
    <section className="closing-template-record-section" aria-label={model.labels.records}>
      <div className="closing-template-section-heading"><h3>{model.labels.records}</h3><span>{model.labels.count}</span></div>
      <div className="closing-template-records">{model.records.map(record => <article className={`closing-template-record${record.pending ? " is-pending" : record.highlighted ? " is-highlighted" : ""}`} key={record.key}>
        <header className="closing-template-record-title"><strong>{record.title}</strong><div className="closing-template-badges">{record.addon && <span className="closing-template-addon" aria-label={record.addon}>＋</span>}{record.discount && <span className="closing-template-discount">{record.discount}</span>}</div></header>
        <time className="closing-template-time">{record.time}</time>
        {record.addon && <p className="closing-template-extra">{record.addon}</p>}
        {record.pending && <p className="closing-template-pending">{record.pendingText}</p>}
        <div className="closing-template-gross"><span>{model.labels.gross}</span><strong>{record.gross}</strong></div>
        <div className="closing-template-payment-row"><span>{model.labels.received}</span><Payments parts={record.service} /></div>
        <div className="closing-template-payment-row"><span>{model.labels.tips}</span><Payments parts={record.tips} /></div>
        <div className="closing-template-income"><span>{model.labels.recordIncome}</span><strong>{record.income}</strong></div>
      </article>)}</div>
      {model.records.length === 0 && <p className="closing-template-empty">{model.labels.empty}</p>}
    </section>
    <footer className="closing-template-footer"><p>{model.labels.legend}</p><p>{model.labels.footer}</p></footer>
  </article>;
}
