"use client";

import { groupEmployeeSettlementRecordsByDay, type EmployeeSettlementDaySummary } from "../../lib/employee-settlement";
import type { EmployeeSettlementStatement, EmployeeSettlementPaymentScope } from "../../lib/types";
import { formatUsdPrecise } from "../../lib/money";
import { useLanguage } from "../language-provider";

const money = (value: number) => formatUsdPrecise(value);
const time = (value: string | null, timezone: string) => value ? new Intl.DateTimeFormat("zh-CN", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)) : "—";
const recordName = (record: EmployeeSettlementStatement["records"][number]) => [record.serviceShortName || record.serviceName, ...record.addons.map((item) => item.shortName || item.name)].join(" ＋ ");

function tipPaymentParts(record: EmployeeSettlementStatement["records"][number]) {
  const values = [["现金", record.cashTipCents], ["刷卡", record.cardTipCents], ["礼物卡", record.giftCardTipCents]] as const;
  return values.filter(([, value]) => value > 0).map(([label, value]) => `${label} ${money(value)}`).join(" / ") || "—";
}

function paymentNotice(record: EmployeeSettlementStatement["records"][number], scope: EmployeeSettlementPaymentScope) {
  const hasCash = record.cashServiceCents > 0 || record.cashTipCents > 0;
  const hasNonCash = record.nonCashServiceCents > 0 || record.nonCashTipCents > 0;
  if (!hasCash || !hasNonCash) return null;
  if (scope === "CASH") return "包含非现金付款 · 本结算仅计算现金部分";
  if (scope === "NON_CASH") return "包含现金付款 · 本结算仅计算刷卡＋礼物卡部分";
  return "现金＋非现金混合付款";
}

function localizedBusinessDate(value: string, locale: "zh-CN" | "en-US") {
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    day: "numeric",
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${value}T12:00:00.000Z`));
}

function SettlementRecordCard({
  preview,
  record,
  index,
}: {
  preview: EmployeeSettlementStatement;
  record: EmployeeSettlementStatement["records"][number];
  index: number;
}) {
  const { locale } = useLanguage();
  const cash = preview.paymentScope === "CASH";
  const single = preview.paymentScope !== "ALL";
  const notice = paymentNotice(record, preview.paymentScope);
  const largeFeeWage = cash ? record.cashLargeFeeWageCents : record.nonCashLargeFeeWageCents;
  const tip = cash ? record.cashTipCents : record.nonCashTipCents;
  const selectedIncome = cash ? record.cashIncomeCents : record.nonCashIncomeCents;

  return (
    <article className="employee-settlement-record-card">
      <div className="employee-settlement-record-card__topline">
        <div>
          <strong>{recordName(record)}</strong>
          <span className="record-time">{time(record.startAt, preview.storeTimezone)}–{time(record.endAt, preview.storeTimezone)}</span>
        </div>
        <span>{locale === "en-US" ? `#${index + 1}` : `第 ${index + 1} 笔`}</span>
      </div>
      <div className="employee-settlement-record-card__payments">
        <span><small>大费基数</small><b>{money(record.grossFeeBaseCents)}</b></span>
        <span><small>小费</small><b>{tipPaymentParts(record)}</b></span>
      </div>
      {notice && <small className="settlement-payment-notice">{notice}</small>}
      <dl className="employee-settlement-record-card__income">
        {single ? <>
          <div><dt>大费工资</dt><dd>{money(largeFeeWage)}</dd></div>
          <div><dt>所选小费</dt><dd>{money(tip)}</dd></div>
          <div className="total"><dt>本笔收入</dt><dd>{money(selectedIncome)}</dd></div>
        </> : <>
          <div><dt>现金收入</dt><dd>{money(record.cashIncomeCents)}</dd></div>
          <div><dt>刷卡＋礼卡收入</dt><dd>{money(record.nonCashIncomeCents)}</dd></div>
          <div className="total"><dt>本笔总收入</dt><dd>{money(record.totalIncomeCents)}</dd></div>
        </>}
      </dl>
    </article>
  );
}

function SettlementDaySummaryCard({
  paymentScope,
  summary,
}: {
  paymentScope: EmployeeSettlementPaymentScope;
  summary: EmployeeSettlementDaySummary;
}) {
  const { locale } = useLanguage();
  const cash = paymentScope === "CASH";
  const total = paymentScope === "ALL"
    ? summary.totalIncomeCents
    : cash
      ? summary.cashIncomeCents
      : summary.nonCashIncomeCents;

  return (
    <article className="employee-settlement-record-card employee-settlement-record-card--summary">
      <div className="employee-settlement-record-card__topline">
        <strong>当日总结</strong>
        <span>{locale === "en-US" ? `${summary.recordCount} records` : `${summary.recordCount} 笔`}</span>
      </div>
      <div className="employee-settlement-record-card__amount">
        <small>{paymentScope === "ALL" ? "当日总收入" : cash ? "现金工资合计" : "非现金工资合计"}</small>
        <strong>{money(total)}</strong>
      </div>
      <dl className="employee-settlement-record-card__daily-summary">
        <div><dt>大费基数</dt><dd>{money(summary.grossFeeBaseCents)}</dd></div>
        {paymentScope === "ALL" ? <>
          <div><dt>现金收入</dt><dd>{money(summary.cashIncomeCents)}</dd></div>
          <div><dt>刷卡＋礼卡收入</dt><dd>{money(summary.nonCashIncomeCents)}</dd></div>
        </> : <>
          <div><dt>{cash ? "现金大费工资" : "刷卡＋礼卡大费工资"}</dt><dd>{money(cash ? summary.cashLargeFeeWageCents : summary.nonCashLargeFeeWageCents)}</dd></div>
          <div><dt>{cash ? "现金小费" : "刷卡＋礼卡小费"}</dt><dd>{money(cash ? summary.cashTipCents : summary.nonCashTipCents)}</dd></div>
        </>}
      </dl>
    </article>
  );
}

export function SettlementRecords({ preview }: { preview: EmployeeSettlementStatement }) {
  const { locale } = useLanguage();
  const days = groupEmployeeSettlementRecordsByDay(preview.records);
  const countLabel = locale === "en-US"
    ? `${days.length} days · ${preview.records.length} records`
    : `${days.length} 天 · ${preview.records.length} 笔`;

  return (
    <section className="employee-settlement-records">
      <header>
        <div>
          <h3>按日记工</h3>
          <p>每天先展示当日总结，再按时间排列记工。</p>
        </div>
        <strong>{countLabel}</strong>
      </header>
      {days.length > 0 ? (
        <div className="employee-settlement-days">
          {days.map((day) => (
            <section className="employee-settlement-day" key={day.businessDate}>
              <header>
                <div>
                  <time dateTime={day.businessDate}>{localizedBusinessDate(day.businessDate, locale)}</time>
                  <span>{day.businessDate}</span>
                </div>
                <strong>{locale === "en-US" ? `${day.records.length} records` : `${day.records.length} 笔记工`}</strong>
              </header>
              <div className="employee-settlement-day-track" aria-label={locale === "en-US" ? `${day.businessDate} records and summary` : `${day.businessDate} 记工与总结`}>
                <SettlementDaySummaryCard paymentScope={preview.paymentScope} summary={day.summary} />
                {day.records.map((record, index) => (
                  <SettlementRecordCard key={record.id} preview={preview} record={record} index={index} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <p className="empty-state">当前范围没有符合条件的已确认记工。</p>
      )}
    </section>
  );
}
