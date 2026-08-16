export const financeSummaryMetrics = [
  {
    key: "recordCount",
    label: "项目数量",
    explanation: "当前筛选范围内的有效记工单数，包含已确认和待结账记录。",
    calculation: "逐笔统计符合日期、员工、付款方式和金额类型筛选的未删除记工。",
  },
  {
    key: "mainServiceAmountCents",
    label: "主要项目金额",
    explanation: "每笔记工的主要服务项目金额合计，不包含额外项目。",
    calculation: "主要项目金额 = Σ 每笔记工的主要项目金额。",
  },
  {
    key: "addonTotalCents",
    label: "额外项目总额",
    explanation: "当前范围内所有额外项目（加项）的金额合计。",
    calculation: "额外项目总额 = Σ 每笔记工的全部额外项目金额。",
  },
  {
    key: "grossFeeBaseCents",
    label: "大费基数",
    explanation: "扣除任何折扣前的项目业绩，也是计算项目提成工资的基础。",
    calculation: "大费基数 = 主要项目金额 + 额外项目总额。",
  },
  {
    key: "discountTotalCents",
    label: "折扣总额",
    explanation: "店铺在当前范围内承担的全部手动和自动折扣，不会降低员工提成工资。",
    calculation: "折扣总额 = Σ 每笔记工的全部折扣金额。",
  },
  {
    key: "discountedFeePerformanceCents",
    label: "折后大费业绩",
    explanation: "应用店铺折扣后的项目业绩，用于查看店铺实际折后表现。",
    calculation: "折后大费业绩 = 大费基数 − 折扣总额。",
  },
  {
    key: "actualServiceCollectedCents",
    label: "实收服务费",
    explanation: "客人实际支付的大费，不包含任何小费；它可以与折后大费业绩不同。",
    calculation: "实收服务费 = 现金大费 + 刷卡大费。",
  },
  {
    key: "cashServiceCents",
    label: "现金大费",
    explanation: "客人以现金方式实际支付的服务大费合计。",
    calculation: "现金大费 = Σ 每笔记工已填写的现金大费。",
  },
  {
    key: "cardServiceCents",
    label: "刷卡大费",
    explanation: "客人以刷卡方式实际支付的服务大费合计。",
    calculation: "刷卡大费 = Σ 每笔记工已填写的刷卡大费。",
  },
  {
    key: "cashTipCents",
    label: "现金小费",
    explanation: "客人以现金方式支付给员工的小费合计。",
    calculation: "现金小费 = Σ 每笔记工已填写的现金小费。",
  },
  {
    key: "cardTipCents",
    label: "刷卡小费",
    explanation: "客人以刷卡方式支付给员工的小费合计。",
    calculation: "刷卡小费 = Σ 每笔记工已填写的刷卡小费。",
  },
  {
    key: "totalTipCents",
    label: "小费总额",
    explanation: "当前范围内客人支付的全部小费。",
    calculation: "小费总额 = 现金小费 + 刷卡小费。",
  },
  {
    key: "customerTotalPaidCents",
    label: "客人总付款",
    explanation: "客人实际支付的服务费与小费总和。",
    calculation: "客人总付款 = 实收服务费 + 小费总额。",
  },
  {
    key: "totalLargeFeeWageCents",
    label: "大费工资",
    explanation: "员工从主要项目和额外项目中应得的提成工资，折扣不会降低该金额。",
    calculation: "大费工资 = Σ 每个项目分别按“项目金额 × 生效提成比例”四舍五入后的工资。",
  },
  {
    key: "employeeIncomeCents",
    label: "员工总收入",
    explanation: "员工在当前范围内应得的大费工资和小费合计。",
    calculation: "员工总收入 = 大费工资 + 现金小费 + 刷卡小费。",
  },
  {
    key: "settledCashAcquiredWithinRangeCents",
    label: "已通过现金取得",
    explanation: "已完成现金结算后，确认员工实际从现金中取得的工资和现金小费。未结清记录不计入。",
    calculation: "已通过现金取得 = 已结清的实际现金大费工资 + 已结清的现金小费。",
  },
] as const;

export type FinanceSummaryMetricKey = typeof financeSummaryMetrics[number]["key"];

export const financeSummaryGroups: ReadonlyArray<{
  key: string;
  title: string;
  description: string;
  metricKeys: readonly FinanceSummaryMetricKey[];
  emphasis?: boolean;
}> = [
  {
    key: "overview",
    title: "先看关键结果",
    description: "先回答今天做了多少、客人付了多少、店里做出多少业绩、员工应得多少。",
    metricKeys: ["recordCount", "customerTotalPaidCents", "discountedFeePerformanceCents", "employeeIncomeCents"],
    emphasis: true,
  },
  {
    key: "performance",
    title: "项目与业绩",
    description: "从项目原价、加项和折扣，逐步看到实际服务费表现。",
    metricKeys: ["mainServiceAmountCents", "addonTotalCents", "grossFeeBaseCents", "discountTotalCents", "actualServiceCollectedCents"],
  },
  {
    key: "payments",
    title: "收款构成",
    description: "把现金、刷卡、大费和小费分开，便于核对收款渠道。",
    metricKeys: ["cashServiceCents", "cardServiceCents", "cashTipCents", "cardTipCents", "totalTipCents"],
  },
  {
    key: "wages",
    title: "工资与现金结算",
    description: "查看项目提成工资，以及员工已通过现金实际取得的部分。",
    metricKeys: ["totalLargeFeeWageCents", "settledCashAcquiredWithinRangeCents"],
  },
];
