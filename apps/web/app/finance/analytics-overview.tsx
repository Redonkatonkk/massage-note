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
    { key: "revenue7", label: t("近7天日均营业额", "7-day average daily revenue") },
    { key: "revenue30", label: t("近30天日均营业额", "30-day average daily revenue") },
    { key: "records30", label: t("近30天平均日单量", "30-day average daily service count") },
    { key: "income30", label: t("近30天总收入", "30-day total income") },
  ] as const;
  const amount = (value: string | null, count: boolean) => value === null ? "—" : count
    ? `${decimal.format(Number(value))} ${t("单／日", "records/day")}` : formatUsdPrecise(Number(value), locale);
  const changeValue = (metric: FinanceTrendComparison | undefined) => {
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
      case "COMPARABLE": return "";
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
          <dd className="analytics-overview__value"><strong>{amount(metric?.current.value ?? null, count)}</strong></dd>
          <dd className="analytics-overview__change" data-direction={metric?.direction ?? undefined}>{t("环比", "Period change")} <span className="analytics-overview__change-number">{changeValue(metric)}</span></dd>
          {metric && <>
            {metric.status !== "COMPARABLE" && <dd className="analytics-overview__caption">{reason(metric)}{metric.difference !== null && <> · {t("变化", "Change")} {Number(metric.difference) > 0 ? "+" : ""}{amount(metric.difference, count)}</>}</dd>}
            <dd className="analytics-overview__periods">
              <span>{t("本期", "Current")}: {metric.current.dateFrom} — {metric.current.dateTo}</span>
              <span>{t("上期", "Previous")}: {metric.previous.dateFrom} — {metric.previous.dateTo}</span>
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
