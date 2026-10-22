"use client";

import type { FinanceAnalyticsTrends, FinanceTrendComparison } from "@massage-note/contracts";
import { formatUsdPrecise } from "../../lib/money";
import { useLanguage } from "../language-provider";
import { UiIcon } from "../ui/primitives";

export function AnalyticsOverview({ trends, loading = false, failed = false }: { trends: FinanceAnalyticsTrends | null; loading?: boolean; failed?: boolean }) {
  const { locale } = useLanguage();
  const en = locale === "en-US";
  const t = (zh: string, english: string) => en ? english : zh;
  const decimal = new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const metrics = [
    { key: "revenue7", label: t("7天环比", "7-day change"), caption: t("近7天日均营业额", "7-day average daily revenue"), days: 7 },
    { key: "revenue30", label: t("30天环比", "30-day change"), caption: t("近30天日均营业额", "30-day average daily revenue"), days: 30 },
    { key: "records30", label: t("30天平均日单量环比", "30-day daily service count change"), caption: t("近30天平均日单量", "30-day average daily service count"), days: 30 },
    { key: "income30", label: t("30天总收入环比", "30-day total income change"), caption: t("近30天总收入", "30-day total income"), days: 30 },
  ] as const;
  const amount = (value: string | null, count: boolean) => value === null ? "—" : count
    ? `${decimal.format(Number(value))} ${t("单／日", "records/day")}` : formatUsdPrecise(Number(value), locale);
  const mainValue = (metric: FinanceTrendComparison | undefined) => {
    if (metric?.status === "NEW") return t("新增", "New");
    if (metric?.changeTenthsPercent == null) return "—";
    const arrow = metric.direction === "UP" ? "↑" : metric.direction === "DOWN" ? "↓" : "→";
    return `${arrow} ${decimal.format(Math.abs(metric.changeTenthsPercent) / 10)}%`;
  };
  const reason = (metric: FinanceTrendComparison | undefined) => {
    if (!metric) return "";
    switch (metric.status) {
      case "NO_SAMPLES": return t("本期无已日结样本", "No closed-day samples in this period");
      case "NO_BASELINE": return t("上期无已日结样本，暂无可比数据", "No closed-day samples in the previous period; comparison unavailable");
      case "NEW": return t("上期为零，本期新增", "Previous period was zero; new activity");
      case "ZERO_BASELINE": return t("上期为零，无法计算比例", "Previous period was zero; percentage unavailable");
      case "NEGATIVE_BASELINE": return t("上期为负数，无法计算比例", "Previous period was negative; percentage unavailable");
      case "COMPARABLE": return metric.direction === "UP" ? t("上涨", "Up") : metric.direction === "DOWN" ? t("下降", "Down") : t("持平", "Unchanged");
    }
  };
  const available = !failed && trends !== null;
  return <section className="analytics-overview" aria-label={t("经营趋势", "Business trends")} aria-busy={loading}>
    {available && <p className="analytics-overview__as-of">{t("趋势截至", "Trends as of")} <time dateTime={trends.asOf}>{trends.asOf}</time> · {t("最近已日结日", "Latest closed business day")}</p>}
    <dl className="analytics-overview__metrics">
      {metrics.map(config => {
        const metric = available ? trends[config.key] : undefined;
        const count = config.key === "records30";
        return <div className="analytics-overview__metric" key={config.key} data-metric={config.key}>
          <dt><UiIcon name={count ? "log" : "trend"} />{config.label}</dt>
          <dd className="analytics-overview__change" data-direction={metric?.direction ?? undefined}>{mainValue(metric)}</dd>
          <dd className="analytics-overview__value">{config.caption} <strong>{amount(metric?.current.value ?? null, count)}</strong></dd>
          {metric && <>
            <dd className="analytics-overview__caption">{reason(metric)}{metric.status !== "COMPARABLE" && metric.difference !== null && <> · {t("变化", "Change")} {Number(metric.difference) > 0 ? "+" : ""}{amount(metric.difference, count)}</>}</dd>
            <dd className="analytics-overview__periods">
              <span>{t("本期", "Current")}: {metric.current.dateFrom} — {metric.current.dateTo} · {metric.current.closedDayCount}/{config.days} {t("个已日结日", "closed days")}</span>
              <span>{t("上期", "Previous")}: {metric.previous.dateFrom} — {metric.previous.dateTo} · {metric.previous.closedDayCount}/{config.days} {t("个已日结日", "closed days")}</span>
              {metric.current.closedDayCount !== metric.previous.closedDayCount && <span>{t("两期已日结样本天数不同", "Closed-day sample counts differ between periods")}</span>}
            </dd>
          </>}
        </div>;
      })}
    </dl>
    {failed ? <p className="analytics-overview__note" role="status">{t("趋势暂时无法读取，请重试上方图表请求。", "Trends are unavailable. Retry the charts above.")}</p>
      : loading ? <p className="analytics-overview__note" role="status">{t("正在更新经营趋势…", "Updating business trends…")}</p>
      : !trends && <p className="analytics-overview__note" role="status">{t("截至所选结束日期，暂无已日结数据。", "No closed-day data exists on or before the selected end date.")}</p>}
    <p className="analytics-overview__note">{t("仅统计7／30个自然日窗口内的已日结样本；起始日期不截断窗口。日单量为记工笔数，总收入已扣刷卡手续费。", "Uses closed-day samples within 7/30-calendar-day windows, independently of the selected start date. Daily service count means work records; total income is after card fees.")}</p>
  </section>;
}
