export const financeSummaryMetrics = [
  {
    key: "itemCount",
    label: "全部项目数量",
    explanation: "当前筛选范围内的有效记工和礼物卡销售总数量。",
    calculation: "全部项目数量 = 记工数量 + 礼物卡销售张数。限定员工、仅大费、仅小费或仅高亮记工时，不计店铺级礼物卡销售。",
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
    key: "totalTurnoverCents",
    label: "总流水",
    explanation: "当前筛选范围内的折后项目业绩与礼物卡净流入合计，不包含小费。",
    calculation: "总流水 = 折后大费业绩 + 礼物卡销售收入 − 礼物卡核销支出。",
  },
  {
    key: "actualServiceCollectedCents",
    label: "实收服务费",
    explanation: "客人实际支付的大费，不包含任何小费；它可以与折后大费业绩不同。",
    calculation: "实收服务费 = 现金大费 + 刷卡大费 + 礼物卡大费。",
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
    key: "giftCardServiceCents",
    label: "礼物卡大费",
    explanation: "客人使用礼物卡实际支付的服务大费合计。",
    calculation: "礼物卡大费 = Σ 每笔记工已填写的礼物卡大费。",
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
    key: "giftCardTipCents",
    label: "礼物卡小费",
    explanation: "客人使用礼物卡支付给员工的小费合计。",
    calculation: "礼物卡小费 = Σ 每笔记工已填写的礼物卡小费。",
  },
  {
    key: "totalTipCents",
    label: "小费总额",
    explanation: "当前范围内客人支付的全部小费。",
    calculation: "小费总额 = 现金小费 + 刷卡小费 + 礼物卡小费。",
  },
  {
    key: "giftCardSaleCashCents",
    label: "卖卡现金收款",
    explanation: "客人购买礼物卡时以现金支付的金额，不进入任何员工现金结算。",
    calculation: "卖卡现金收款 = Σ 礼物卡销售记录中的现金付款。",
  },
  {
    key: "giftCardSaleCardCents",
    label: "卖卡刷卡收款",
    explanation: "客人购买礼物卡时以刷卡支付的金额。",
    calculation: "卖卡刷卡收款 = Σ 礼物卡销售记录中的刷卡付款。",
  },
  {
    key: "giftCardSalesAmountCents",
    label: "礼物卡销售收入",
    explanation: "卖出礼物卡实际收到的全部款项，全部算作店铺收入，不参与员工分成。",
    calculation: "礼物卡销售收入 = 卖卡现金收款 + 卖卡刷卡收款。",
  },
  {
    key: "giftCardRedemptionCents",
    label: "礼物卡核销支出",
    explanation: "客人使用礼物卡支付的大费和小费，按店铺支出处理。",
    calculation: "礼物卡核销支出 = 礼物卡大费 + 礼物卡小费。",
  },
  {
    key: "storeIncomeCents",
    label: "店铺收入",
    explanation: "店铺在当前范围内的经营收入；卖卡记收入，用卡核销记支出。",
    calculation: "店铺收入 = 折后大费业绩 + 所选小费 − 所选员工收入 + 礼物卡销售收入 − 礼物卡核销支出。按付款方式筛选时，员工收入只计算对应来源。",
  },
  {
    key: "ownerWorkerIncomeCents",
    label: "店长总收入",
    explanation: "店长在当前筛选范围内亲自记工所得的大费工资和小费，不包含店铺经营收入。",
    calculation: "店长总收入 = 店长作为工人的所选来源大费工资 + 所选来源小费。",
  },
  {
    key: "managerWorkerIncomeCents",
    label: "经理总收入",
    explanation: "所有经理在当前筛选范围内亲自记工所得的大费工资和小费合计。",
    calculation: "经理总收入 = Σ 每位经理作为工人的所选来源大费工资与所选来源小费。",
  },
  {
    key: "giftCardNetIncomeCents",
    label: "礼物卡收入",
    explanation: "当前筛选范围内卖出礼物卡的实际收款减去客人使用礼物卡的核销支出。",
    calculation: "礼物卡收入 = 礼物卡销售收入 − 礼物卡核销支出。",
  },
  {
    key: "creditCardFeeCents",
    label: "信用卡手续费",
    explanation: "当前筛选范围内记工产生的刷卡手续费；不包含礼物卡付款或卖卡刷卡收款。",
    calculation: "信用卡手续费 = 未高亮记工刷卡金额 × 2.5% + 含刷卡付款的高亮记工数量 × $3。部分刷卡也按一笔计算。",
  },
  {
    key: "totalIncomeCents",
    label: "总收入",
    explanation: "店铺总结算中前四项收入相加，再扣除信用卡手续费。",
    calculation: "总收入 = 店铺收入 + 店长总收入 + 经理总收入 + 礼物卡收入 − 信用卡手续费。",
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
    description: "先看项目数量、折后业绩和包含礼物卡净收支的总流水。",
    metricKeys: ["itemCount", "totalTurnoverCents", "discountedFeePerformanceCents"],
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
    description: "把现金、刷卡、礼物卡、大费和小费分开，便于核对收款渠道。",
    metricKeys: ["cashServiceCents", "cardServiceCents", "giftCardServiceCents", "cashTipCents", "cardTipCents", "giftCardTipCents", "totalTipCents"],
  },
  {
    key: "gift-cards",
    title: "礼物卡与店铺收入",
    description: "卖卡全部计入店铺收入；客人使用礼物卡付款时，核销金额计为店铺支出。",
    metricKeys: ["giftCardSaleCashCents", "giftCardSaleCardCents", "giftCardSalesAmountCents", "giftCardRedemptionCents"],
  },
  {
    key: "store-settlement",
    title: "店铺总结算",
    description: "汇总店铺经营、店长与经理作为工人的收入、礼物卡净收支和信用卡手续费。",
    metricKeys: ["storeIncomeCents", "ownerWorkerIncomeCents", "managerWorkerIncomeCents", "giftCardNetIncomeCents", "creditCardFeeCents", "totalIncomeCents"],
  },
];
