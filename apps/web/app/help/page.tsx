import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "使用帮助｜Massage note",
  description: "Massage note的记工、金额、结算和权限说明",
};

const moneyRows = [
  ["大费基数", "主要项目金额 + 所有额外项目金额。它是未扣折扣前的项目业绩，也是提成计算的基础。"],
  ["折后大费业绩", "大费基数 − 折扣总额。它表示应用折扣后的项目业绩，最低为 0。"],
  ["实际收到大费", "现金大费 + 刷卡大费。它来自实际付款，可与折后大费业绩不同；系统会醒目标出差额。"],
  ["小费总额", "现金小费 + 刷卡小费。小费不参与项目提成。"],
  ["客人总付款", "实际收到大费 + 小费总额。"],
  ["大费工资", "每个项目或额外项目金额 × 该项最终提成比例，逐项按美分四舍五入后相加。"],
  ["员工总收入", "大费工资 + 小费总额。"],
  ["员工手中现金", "现金大费 + 现金小费。"],
  ["当日应交 / 应补", "员工手中现金 − 分配到现金部分的工资。正数表示员工应交店里，负数表示店里应补员工。"],
  ["老板尚欠", "累计员工总收入 − 员工已通过现金保留获得的工资 − 工资结算账本净支付。最低显示为 0；多付部分单独显示。"],
] as const;

export default function HelpPage() {
  return <main className="help-shell">
    <header className="help-hero"><div><p className="eyebrow">Massage note</p><h1>使用帮助</h1><p>这里说明最常用的操作、金额口径和安全规则。所有财务金额都由服务器按整数美分计算。</p></div><a className="primary-action help-back" href="/">返回今日记工</a></header>

    <section className="help-grid">
      <article className="help-card"><h2>当天记工</h2><ol><li>在员工行点“快速记工”。</li><li>选择主要项目；需要时填写实际开始时间。</li><li>先保存即可开工，记录会显示“待结账”。</li><li>客人付款后打开详情，现金大费和刷卡大费至少填一项；现金小费和刷卡小费都可以留空，系统按 0 计算并结算。</li></ol><p>当天的有效成员都能帮助任何员工新增或纠正当天记录。历史营业日只能由店主或经理在取消日结后修改。</p></article>
      <article className="help-card"><h2>打卡与今日表格</h2><ul><li>参与记工的店主、经理和员工都能上下班打卡。</li><li>“加入今日”只影响当天表格，不会删除成员。</li><li>拖动排序、隐藏、打卡和记工变化会同步到其他已登录设备。</li><li>断网时不要重复提交；页面会保留已编辑草稿，联网后再保存。</li></ul></article>
      <article className="help-card"><h2>日结与现金</h2><ul><li>正常日结要求当天没有待付款、未结现金或其他阻塞项。</li><li>强制日结必须填写原因，异常会保留在日结快照和审计中。</li><li>现金结清记录“员工已保留多少工资”和“已上交/店里已补多少”。</li><li>取消日结或修改相关历史记录时，受影响的现金状态会安全回退，需要重新核对。</li></ul></article>
      <article className="help-card"><h2>工资结算</h2><ul><li>工资支付使用独立账本，不会改写原始记工。</li><li>可记录部分支付、负调整和备注。</li><li>店主本人参与服务时会显示经营核算收入，但不会形成“老板欠自己”的工资。</li><li>删除工资账本记录属于软删除，可在管理权限下恢复并留有审计。</li></ul></article>
    </section>

    <section className="help-card help-money"><h2>金额与总额怎么计算</h2><div className="help-definition-list">{moneyRows.map(([name, description]) => <div key={name}><h3>{name}</h3><p>{description}</p></div>)}</div><div className="help-example"><strong>例子</strong><p>主要项目 $100，额外项目 $20，折扣 $10，现金大费 $60，刷卡大费 $50，刷卡小费 $20，提成均为 60%。</p><p>大费基数 = $120；折后大费业绩 = $110；实际收到大费 = $110；小费 = $20；客人总付款 = $130；大费工资 = $72；员工总收入 = $92。</p></div></section>

    <section className="help-grid">
      <article className="help-card"><h2>提成优先顺序</h2><p>系统依次寻找：员工对该项目的专属提成 → 项目默认提成 → 员工默认提成 → 全店默认提成。记工保存后会留下项目、价格和提成快照，以后修改设置不会改变历史。</p></article>
      <article className="help-card"><h2>AI 助手</h2><p>记工助手只生成结构化预览，必须由你确认才会写入；财务助手只读取后端统计，不能修改日结、现金或工资账本。模型未配置时，手动记工、财务和简单中文新增仍可使用。</p></article>
      <article className="help-card"><h2>角色权限</h2><p>店主和经理管理项目、成员、日结与结算；经理不能转移店主或删除店铺。员工能查看和协助修改当天全员记工，但历史财务只看自己。</p></article>
      <article className="help-card"><h2>遇到冲突或错误</h2><p>“记录刚被别人修改”表示系统阻止了旧页面覆盖新数据，请重新加载后核对。“营业日已日结”需要管理者先取消日结。若页面持续失败，请把错误旁的请求编号交给维护人员。</p></article>
    </section>
  </main>;
}
